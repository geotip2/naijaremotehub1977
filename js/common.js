"use strict";

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase().replace(/\s/g, "");
}

function money(value) {
  return new Intl.NumberFormat("en-NG", {style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(value || 0));
}

function safeText(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showNotice(id, message, type="error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = "notice show " + (type === "success" ? "success" : "error");
}
function clearNotice(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.className = "notice"; }
}
function setBusy(id, busy, busyText) {
  const button = document.getElementById(id);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText || "Please wait…";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}
function showPage(page) {
  // Signed-in members never see the landing/auth screens: send them to their dashboard.
  if ((page === "home" || page === "auth") && currentUser) page = "dashboard";
  if ((page === "dashboard" || page === "admin") && !currentUser) {
    openAuth("login");
    return;
  }
  if (page === "admin" && !(userData && userData.is_admin === true)) {
    showPage("dashboard");
    return;
  }
  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  const target = document.getElementById(page);
  if (target) target.classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
}
function openAuth(mode="login") {
  if (currentUser) { showPage("dashboard"); return; }
  switchAuth(mode);
  showPage("auth");
}
function switchAuth(mode) {
  const isLogin = mode === "login";
  document.getElementById("loginForm").classList.toggle("hidden", !isLogin);
  document.getElementById("signupForm").classList.toggle("hidden", isLogin);
  document.getElementById("loginTab").className = "btn " + (isLogin ? "tab-active" : "tab-idle");
  document.getElementById("signupTab").className = "btn " + (!isLogin ? "tab-active" : "tab-idle");
  clearNotice("loginError"); clearNotice("signupError");
}
function updateNavigation() {
  const signedIn = !!currentUser;
  document.getElementById("navLogin").classList.toggle("hidden", signedIn);
  document.getElementById("navLogout").classList.toggle("hidden", !signedIn);
  document.getElementById("navDashboard").classList.toggle("hidden", !signedIn);
  document.getElementById("navAdmin").classList.toggle("hidden", !(signedIn && userData && userData.is_admin === true));
}
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
    await loadCurrentProfile(credential.user);
    showPage("dashboard");
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
  } catch (error) {
    showNotice("loginError", friendlyError(error));
  } finally { setBusy("loginSubmit", false); }
}
function friendlyError(error) {
  const code = error && error.code;
  const messages = {
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/user-not-found":"No account was found with that email.",
    "auth/wrong-password":"Incorrect email or password.",
    "auth/invalid-credential":"Incorrect email or password.",
    "auth/email-already-in-use":"An account already exists with this email. Please log in.",
    "auth/weak-password":"Choose a stronger password (at least 6 characters).",
    "auth/too-many-requests":"Too many attempts. Please wait and try again.",
    "permission-denied":"Permission denied by Firestore rules. Check your Firebase security rules.",
    "unavailable":"Service temporarily unavailable. Please try again."
  };
  return messages[code] || (error && error.message) || "Something went wrong. Please try again.";
}
async function logout() {
  try { await auth.signOut(); }
  catch (error) { alert(friendlyError(error)); }
}
auth.onAuthStateChanged(async user => {
  currentUser = user || null;
  userData = null;
  stopLiveListeners();
  if (currentUser) {
    try {
      await loadCurrentProfile(currentUser);
      updateNavigation();
      // Stay on Admin only if this user is an admin; otherwise always land on the dashboard.
      const onAdmin = document.getElementById("admin").classList.contains("active");
      if (!(onAdmin && userData && userData.is_admin === true)) showPage("dashboard");
    } catch (error) {
      console.error(error);
      updateNavigation();
      showPage("dashboard");
      if (error.code === "permission-denied") alert("Your account profile could not be read. Check your Firestore rules.");
    }
  } else {
    updateNavigation();
    // Signed out: hide member areas and show the login form again (but keep the landing page on first visit).
    if (!document.getElementById("home").classList.contains("active")) openAuth("login");
  }
});
async function loadCurrentProfile(user) {
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    // Repairs a missing profile for an authenticated account without granting privileges.
    const name = user.displayName || (user.email ? user.email.split("@")[0] : "Member");
    const profile = {full_name:name,email:cleanEmail(user.email),ref_code:makeReferralCode(name),referred_by:null,balance:0,is_admin:false,is_paid:false,createdAt:serverTimestamp()};
    await ref.set(profile);
    userData = {...profile};
  } else userData = snap.data() || {};
  renderDashboard();
  startLiveListeners();
  updateNavigation();
}
function renderDashboard() {
  if (!currentUser || !userData) return;
  document.getElementById("memberGreeting").textContent = (userData.full_name || "Member") + " · " + (userData.email || currentUser.email || "");
  document.getElementById("walletBalance").textContent = money(userData.balance);
  document.getElementById("myRefCode").textContent = userData.ref_code || "—";
  document.getElementById("accountBadge").textContent = userData.is_paid === true ? "PAID MEMBER" : "FREE ACCOUNT";
  document.getElementById("accountBadge").className = "pill " + (userData.is_paid === true ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700");
  document.getElementById("membershipText").textContent = userData.is_paid === true ? "Your one-time membership payment has been verified." : "You are using a free account. Upgrade once to unlock paid learning materials.";
  document.getElementById("upgradeButton").classList.toggle("hidden", userData.is_paid === true);
  const link = new URL(window.location.href);
  link.search = ""; link.hash = ""; link.searchParams.set("ref", userData.ref_code || "");
  document.getElementById("referralLink").value = link.toString();
}
async function copyReferral() {
  const value = document.getElementById("referralLink").value;
  try { await navigator.clipboard.writeText(value); alert("Referral link copied."); }
  catch (_) { const input=document.getElementById("referralLink"); input.select(); document.execCommand("copy"); alert("Referral link copied."); }
}
function shareWhatsApp() {
  const link = document.getElementById("referralLink").value;
  const message = "Join me on NaijaRemoteHub. Learn remote skills and grow your opportunities: " + link;
  window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener");
}

function showNotice(id, message, type="error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = "notice show " + (type === "success" ? "success" : "error");
}

function clearNotice(id) {
  const el = document.getElementById(id);
  if (el) { el.textContent = ""; el.className = "notice"; }
}

function setBusy(id, busy, busyText) {
  const button = document.getElementById(id);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText || "Please wait…";
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function friendlyError(error) {
  const code = error && error.code;
  const messages = {
    "auth/invalid-email":"Please enter a valid email address.",
    "auth/user-not-found":"No account was found with that email.",
    "auth/wrong-password":"Incorrect email or password.",
    "auth/invalid-credential":"Incorrect email or password.",
    "auth/email-already-in-use":"An account already exists with this email. Please log in.",
    "auth/weak-password":"Choose a stronger password (at least 6 characters).",
    "auth/too-many-requests":"Too many attempts. Please wait and try again.",
    "permission-denied":"Permission denied by Firestore rules. Check your Firebase security rules.",
    "unavailable":"Service temporarily unavailable. Please try again."
  };
  return messages[code] || (error && error.message) || "Something went wrong. Please try again.";
}

function safeUrl(value) {
  try { const u=new URL(String(value)); return ["https:","http:"].includes(u.protocol)?safeText(u.href):"#"; }
  catch(_){return "#";}
}

function isHttpUrl(value) {
  try { return ["http:","https:"].includes(new URL(value).protocol); } catch(_){return false;}
}

async function copyReferral() {
  const value = document.getElementById("referralLink").value;
  try { await navigator.clipboard.writeText(value); alert("Referral link copied."); }
  catch (_) { const input=document.getElementById("referralLink"); input.select(); document.execCommand("copy"); alert("Referral link copied."); }
}

function shareWhatsApp() {
  const link = document.getElementById("referralLink").value;
  const message = "Join me on NaijaRemoteHub. Learn remote skills and grow your opportunities: " + link;
  window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener");
}

function updateNavigation() {
  const signedIn = !!currentUser;
  const login = document.getElementById("navLogin");
  const logoutButton = document.getElementById("navLogout");
  const dashboard = document.getElementById("navDashboard");
  const admin = document.getElementById("navAdmin");
  if (login) login.classList.toggle("hidden", signedIn);
  if (logoutButton) logoutButton.classList.toggle("hidden", !signedIn);
  if (dashboard) dashboard.classList.toggle("hidden", !signedIn);
  if (admin) admin.classList.toggle("hidden", !(signedIn && userData && userData.is_admin === true));
}

async function logout() {
  try { await auth.signOut(); window.location.href = "index.html"; }
  catch (error) { alert(friendlyError(error)); }
}

