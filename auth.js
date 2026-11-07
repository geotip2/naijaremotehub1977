"use strict";

function makeReferralCode(fullName) {
  const first = String(fullName || "member").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "") || "member";
  return first + Math.random().toString(36).slice(2, 7);
}

async function findReferrer(code) {
  if (!code) return null;
  const snap = await db.collection("users").where("ref_code", "==", code).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

async function signup(event) {
  event.preventDefault(); clearNotice("signupError");
  const fullName = document.getElementById("signupName").value.trim();
  const email = cleanEmail(document.getElementById("signupEmail").value);
  const password = document.getElementById("signupPassword").value;
  const referralCode = document.getElementById("signupReferral").value.trim();
  if (!fullName) return showNotice("signupError", "Please enter your full name.");
  if (password.length < 6) return showNotice("signupError", "Password must be at least 6 characters.");
  setBusy("signupSubmit", true, "Creating account…");
  try {
    let referredBy = null;
    if (referralCode) {
      referredBy = await findReferrer(referralCode);
      if (!referredBy) throw new Error("That referral code was not found. Check the code or leave the field blank.");
    }
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    const refCode = makeReferralCode(fullName);
    const profile = {
      full_name: fullName, email, ref_code: refCode, referred_by: referredBy,
      balance: 0, is_admin: false, is_paid: false, createdAt: serverTimestamp()
    };
    await db.collection("users").doc(credential.user.uid).set(profile);
    document.getElementById("signupForm").reset();
    window.location.href = "dashboard.html";
  } catch (error) {
    showNotice("signupError", friendlyError(error));
  } finally { setBusy("signupSubmit", false); }
}

async function login(event) {
  event.preventDefault(); clearNotice("loginError");
  const email = cleanEmail(document.getElementById("loginEmail").value);
  const password = document.getElementById("loginPassword").value;
  setBusy("loginSubmit", true, "Signing in…");
  try {
    await auth.signInWithEmailAndPassword(email, password);
    document.getElementById("loginForm").reset();
    window.location.href = "dashboard.html";
  } catch (error) {
    showNotice("loginError", friendlyError(error));
  } finally { setBusy("loginSubmit", false); }
}

auth.onAuthStateChanged(user => {
  currentUser = user || null;
  if (currentUser) {
    if (window.location.pathname.endsWith("login.html")) {
      window.location.href = "dashboard.html";
    }
  }
  updateNavigation();
});
