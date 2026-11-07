"use strict";

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
  link.search = ""; link.hash = ""; link.pathname = link.pathname.substring(0, link.pathname.lastIndexOf("/") + 1) + "signup.html";
  link.searchParams.set("ref", userData.ref_code || "");
  document.getElementById("referralLink").value = link.toString();
}

function startLiveListeners() {
  if (!currentUser) return;
  if (referralsUnsubscribe) referralsUnsubscribe();
  referralsUnsubscribe = db.collection("users").where("referred_by","==",currentUser.uid).onSnapshot(snapshot => {
    document.getElementById("referralCount").textContent = snapshot.size;
  }, error => console.warn("Referral count:",error));
  if (materialsUnsubscribe) materialsUnsubscribe();
  materialsUnsubscribe = db.collection("materials").orderBy("createdAt","desc").onSnapshot(snapshot => {
    renderMaterials(snapshot.docs);
  }, error => {
    document.getElementById("materialsGrid").innerHTML = '<p class="text-red-600">Unable to load learning materials. Check Firestore rules and the materials index.</p>';
    console.error(error);
  });
  if (document.getElementById("homeAnnouncements")) {
    if (announcementsUnsubscribe) announcementsUnsubscribe();
    announcementsUnsubscribe = db.collection("announcements").orderBy("createdAt","desc").limit(8).onSnapshot(snapshot => {
      renderAnnouncements(snapshot.docs);
    }, error => console.warn("Announcements:",error));
  }
  if (userData && userData.is_admin === true) loadAdminData();
}

function stopLiveListeners() {
  [referralsUnsubscribe,materialsUnsubscribe,announcementsUnsubscribe,...adminUnsubscribers].forEach(fn=>{if(typeof fn==="function")fn();});
  referralsUnsubscribe=null;materialsUnsubscribe=null;announcementsUnsubscribe=null;adminUnsubscribers=[];
}

function renderAnnouncements(docs) {
  const container = document.getElementById("homeAnnouncements");
  if (!container) return;
  if (!docs.length) { container.innerHTML='<p class="text-slate-500">No announcements yet. Please check back soon.</p>'; return; }
  container.innerHTML = docs.map(doc => {
    const item=doc.data()||{};
    return `<article class="bg-white rounded-2xl p-5 shadow-soft"><p class="text-xs font-bold uppercase tracking-wider text-green-700">Announcement</p><h3 class="font-extrabold text-lg mt-2">${safeText(item.title)}</h3><p class="text-sm text-slate-600 mt-2 whitespace-pre-wrap">${safeText(item.message)}</p></article>`;
  }).join("");
}

function renderMaterials(docs) {
  const container=document.getElementById("materialsGrid");
  if (!docs.length) {container.innerHTML='<p class="text-slate-500">No learning materials have been published yet.</p>';return;}
  container.innerHTML=docs.map(doc=>{
    const m=doc.data()||{}, free=m.is_free===true, unlocked=free||(userData&&userData.is_paid===true);
    const actions=unlocked
      ? `${m.video_url?`<a class="btn btn-green text-center block" href="${safeUrl(m.video_url)}" target="_blank" rel="noopener noreferrer">▶ Watch Video</a>`:""} ${m.pdf_url?`<a class="btn btn-light text-center block" href="${safeUrl(m.pdf_url)}" target="_blank" rel="noopener noreferrer">↓ Download PDF</a>`:""}`
      : `<div class="locked rounded-xl p-4 text-center"><p class="font-bold text-slate-700">🔒 Upgrade to ₦25,000 to unlock</p><button class="btn btn-green w-full mt-3" onclick="window.location.href='payments.html'">Upgrade Now</button></div>`;
    return `<article class="bg-white rounded-2xl p-5 shadow-soft border border-slate-100 flex flex-col"><div class="flex justify-between items-start gap-2"><span class="pill bg-green-50 text-green-800">${safeText(m.category||"General")}</span><span class="pill ${free?"bg-yellow-100 text-yellow-800":"bg-slate-100 text-slate-700"}">${free?"FREE":"PAID"}</span></div><h3 class="font-extrabold text-lg mt-3">${safeText(m.title)}</h3><p class="text-sm text-slate-600 mt-2 whitespace-pre-wrap flex-1">${safeText(m.description)}</p><div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5">${actions}</div></article>`;
  }).join("");
}

async function requestWithdrawal(event) {
  event.preventDefault();
  const messageId="withdrawMessage";clearNotice(messageId);
  if (!currentUser || !userData) return showNotice(messageId,"Please log in first.");
  const bank=document.getElementById("bankName").value.trim();
  const account=document.getElementById("accountNumber").value.trim();
  const amount=Number(document.getElementById("withdrawAmount").value);
  const balance=Number(userData.balance||0);
  if (!bank || !/^\d{10}$/.test(account)) return showNotice(messageId,"Enter a bank name and a valid 10-digit account number.");
  if (!Number.isSafeInteger(amount) || amount<MIN_WITHDRAWAL) return showNotice(messageId,"Minimum withdrawal is ₦5,000.");
  if (amount>balance) return showNotice(messageId,"Insufficient wallet balance.");
  setBusy("withdrawSubmit",true,"Submitting…");
  try {
    // Atomic client transaction prevents ordinary race conditions, but Firestore
    // Rules / a trusted function must enforce this operation against tampering.
    const userRef=db.collection("users").doc(currentUser.uid);
    const withdrawalRef=db.collection("withdrawals").doc();
    await db.runTransaction(async tx=>{
      const snap=await tx.get(userRef);
      if(!snap.exists)throw new Error("Member profile not found.");
      const latest=Number((snap.data()||{}).balance||0);
      if(amount>latest)throw new Error("Insufficient wallet balance.");
      tx.update(userRef,{balance:latest-amount});
      tx.set(withdrawalRef,{
        uid:currentUser.uid,name:userData.full_name||"",email:currentUser.email||"",
        amount,bank,account,status:"pending",createdAt:serverTimestamp()
      });
    });
    document.getElementById("withdrawForm").reset();
    showNotice(messageId,"Withdrawal request submitted. Your wallet has been debited and the request is pending review.","success");
    await loadCurrentProfile(currentUser);
  } catch(error) { showNotice(messageId,friendlyError(error)); }
  finally { setBusy("withdrawSubmit",false); }
}

function startHomeAnnouncements() {
  const container = document.getElementById("homeAnnouncements");
  if (!container) return;
  if (announcementsUnsubscribe) announcementsUnsubscribe();
  announcementsUnsubscribe = db.collection("announcements").orderBy("createdAt", "desc").limit(8).onSnapshot(snapshot => {
    renderAnnouncements(snapshot.docs);
  }, error => { console.warn("Announcements:", error); container.innerHTML = '<p class="text-slate-500">Announcements could not be loaded.</p>'; });
}

auth.onAuthStateChanged(async user => {
  if (!window.location.pathname.endsWith("dashboard.html")) return;
  currentUser = user || null;
  if (!currentUser) { window.location.href = "login.html"; return; }
  try { await loadCurrentProfile(currentUser); }
  catch (error) { console.error(error); alert(friendlyError(error)); }
});
