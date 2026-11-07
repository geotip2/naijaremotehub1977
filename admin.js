"use strict";

async function postAnnouncement(event) {
  event.preventDefault();clearNotice("announcementMessageBox");
  try {
    await db.collection("announcements").add({
      title:document.getElementById("announcementTitle").value.trim(),
      message:document.getElementById("announcementMessage").value.trim(),
      createdAt:serverTimestamp(),createdBy:currentUser.uid
    });
    document.getElementById("announcementForm").reset();
    showNotice("announcementMessageBox","Announcement published successfully.","success");
  } catch(error) { showNotice("announcementMessageBox",friendlyError(error)); }
}

async function postMaterial(event) {
  event.preventDefault();clearNotice("materialMessage");
  const video=document.getElementById("materialVideo").value.trim();
  const pdf=document.getElementById("materialPdf").value.trim();
  if ((video && !isHttpUrl(video)) || (pdf && !isHttpUrl(pdf))) return showNotice("materialMessage","Please enter valid http or https links.");
  setBusy("materialSubmit",true,"Publishing…");
  try {
    await db.collection("materials").add({
      title:document.getElementById("materialTitle").value.trim(),
      category:document.getElementById("materialCategory").value,
      description:document.getElementById("materialDescription").value.trim(),
      video_url:video,pdf_url:pdf,is_free:document.getElementById("materialFree").checked,
      createdAt:serverTimestamp(),createdBy:currentUser.uid
    });
    document.getElementById("materialForm").reset();
    showNotice("materialMessage","Educational material published successfully.","success");
  } catch(error) { showNotice("materialMessage",friendlyError(error)); }
  finally { setBusy("materialSubmit",false); }
}

function loadAdminData() {
  if (!(userData && userData.is_admin===true)) return;
  adminUnsubscribers.forEach(fn=>fn());adminUnsubscribers=[];
  const usersSub=db.collection("users").orderBy("createdAt","desc").limit(500).onSnapshot(snapshot=>{
    const body=document.getElementById("usersTable");
    if(snapshot.empty){body.innerHTML='<tr><td class="p-2" colspan="4">No users found.</td></tr>';return;}
    body.innerHTML=snapshot.docs.map(doc=>{
      const u=doc.data()||{};
      return `<tr class="border-b"><td class="p-2">${safeText(u.full_name)}</td><td class="p-2">${safeText(u.email)}</td><td class="p-2">${money(u.balance)}</td><td class="p-2">${u.is_paid===true?"PAID":"FREE"}</td></tr>`;
    }).join("");
  },err=>console.error(err));
  const withdrawalSub=db.collection("withdrawals").orderBy("createdAt","desc").limit(300).onSnapshot(snapshot=>{
    const body=document.getElementById("withdrawalsTable");
    if(snapshot.empty){body.innerHTML='<tr><td class="p-2" colspan="5">No withdrawal requests.</td></tr>';return;}
    body.innerHTML=snapshot.docs.map(doc=>{
      const w=doc.data()||{};
      return `<tr class="border-b"><td class="p-2">${safeText(w.name)}</td><td class="p-2">${money(w.amount)}</td><td class="p-2">${safeText(w.bank)}</td><td class="p-2">${safeText(w.account)}</td><td class="p-2"><span class="pill bg-yellow-100 text-yellow-800">${safeText(w.status||"pending")}</span></td></tr>`;
    }).join("");
  },err=>console.error(err));
  const materialSub=db.collection("materials").orderBy("createdAt","desc").onSnapshot(snapshot=>{
    const container=document.getElementById("adminMaterials");
    if(snapshot.empty){container.innerHTML='<p class="text-slate-500">No materials published.</p>';return;}
    container.innerHTML=snapshot.docs.map(doc=>{
      const m=doc.data()||{};
      return `<div class="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><b>${safeText(m.title)}</b><p class="text-sm text-slate-500">${safeText(m.category)} · ${m.is_free===true?"Free":"Paid"}</p></div><button class="btn bg-red-50 text-red-700" onclick="deleteMaterial('${doc.id}')">Delete</button></div>`;
    }).join("");
  },err=>console.error(err));
  adminUnsubscribers=[usersSub,withdrawalSub,materialSub];
}

async function deleteMaterial(id) {
  if (!(userData && userData.is_admin===true)) return alert("Admin access required.");
  if (!confirm("Delete this learning material permanently?")) return;
  try { await db.collection("materials").doc(id).delete(); }
  catch(error) { alert("Could not delete material: "+friendlyError(error)); }
}

auth.onAuthStateChanged(async user => {
  currentUser = user || null;
  if (!currentUser) { window.location.href = "login.html"; return; }
  try {
    const snap = await db.collection("users").doc(currentUser.uid).get();
    userData = snap.exists ? (snap.data() || {}) : {};
    if (userData.is_admin !== true) { window.location.href = "dashboard.html"; return; }
    loadAdminData();
    updateNavigation();
  } catch (error) { console.error(error); alert(friendlyError(error)); window.location.href = "dashboard.html"; }
});
