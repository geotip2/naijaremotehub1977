"use strict";

function goToPayment() { window.location.href = currentUser ? "payments.html" : "login.html"; }

function pay() {
  if (!currentUser || !userData) { window.location.href = "login.html"; return; }
  if (userData.is_paid === true) { alert("Your membership is already active."); return; }
  if (!window.PaystackPop) { alert("Payment service did not load. Refresh the page and try again."); return; }
  if (!PAYSTACK_PUBLIC_KEY || !PAYSTACK_PUBLIC_KEY.startsWith("pk_")) { alert("Paystack public key is not configured."); return; }
  const reference = "NRH_" + currentUser.uid.slice(0,10) + "_" + Date.now() + "_" + Math.random().toString(36).slice(2,7);
  const requestRef = db.collection("payment_requests").doc(reference);
  requestRef.set({
    uid:currentUser.uid,email:cleanEmail(currentUser.email),amount:MEMBERSHIP_FEE_KOBO,
    currency:"NGN",reference,status:"initiated",createdAt:serverTimestamp()
  }).then(() => {
    const handler = PaystackPop.setup({
      key:PAYSTACK_PUBLIC_KEY,
      email:cleanEmail(currentUser.email),
      amount:MEMBERSHIP_FEE_KOBO,
      currency:"NGN",
      ref:reference,
      metadata:{custom_fields:[{display_name:"Firebase User ID",variable_name:"firebase_uid",value:currentUser.uid}]},
      callback:function(response) {
        requestRef.set({status:"awaiting_server_verification",paystack_reference:response.reference,callbackAt:serverTimestamp()},{merge:true})
          .then(() => alert("Payment response received. Your payment is awaiting secure verification. Your account will update automatically after verification."))
          .catch(error => alert("Payment response received, but we could not update its status. Contact support with reference: " + response.reference));
      },
      onClose:function() {
        // Keep the request record for webhook reconciliation; do not mark the user paid.
      }
    });
    handler.openIframe();
  }).catch(error => alert("Could not start payment: " + friendlyError(error)));
}

auth.onAuthStateChanged(async user => {
  if (!window.location.pathname.endsWith("payments.html")) return;
  currentUser = user || null;
  if (!currentUser) { window.location.href = "login.html"; return; }
  try {
    const profileSnap = await db.collection("users").doc(currentUser.uid).get();
    if (!profileSnap.exists) throw new Error("Member profile not found.");
    userData = profileSnap.data() || {};
    updateNavigation();
  } catch (error) { alert(friendlyError(error)); }
});
