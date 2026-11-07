"use strict";

/*
  IMPORTANT SECURITY / DEPLOYMENT NOTES:
  1) Never put a Paystack SECRET KEY in this file. Paystack verification and all
     referral-credit calculations must run on a trusted server (Cloud Function).
  2) This page creates payment_requests as pending. A verified Paystack webhook /
     Cloud Function must validate the reference, amount (2500000 kobo), currency
     (NGN), and customer, then set users/{uid}.is_paid=true and credit eligible
     referral rewards exactly once. A browser callback is NOT proof of payment.
  3) Firestore Security Rules are mandatory. Restrict admin writes to verified
     admins; users must not edit is_admin, is_paid, balance, ref_code or payment
     records. Withdrawal requests/deductions must be enforced transactionally by
     trusted backend rules/functions. Client code alone cannot secure money.
  4) Set your own admin account's is_admin=true from Firebase Console or a trusted
     admin-only backend. Never allow users to promote themselves.
*/

const firebaseConfig = {
  apiKey: "AIzaSyDe4TrV0vzxysfCNOx_X10SHuIaRjO_xeA",
  authDomain: "naijaremotehub-6f584.firebaseapp.com",
  projectId: "naijaremotehub-6f584",
  storageBucket: "naijaremotehub-6f584.firebasestorage.app",
  messagingSenderId: "662711600492",
  appId: "1:662711600492:web:a307027882c532269adf49",
  measurementId: "G-GPWVV5WLEC"
};
const PAYSTACK_PUBLIC_KEY = "pk_live_4925a4ff1de743ea4ee109443a430f1e3efdc10a";
const MEMBERSHIP_FEE_NAIRA = 25000;
const MEMBERSHIP_FEE_KOBO = MEMBERSHIP_FEE_NAIRA * 100;
const MIN_WITHDRAWAL = 5000;

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

let currentUser = null;
let userData = null;
let referralsUnsubscribe = null;
let materialsUnsubscribe = null;
let announcementsUnsubscribe = null;
let adminUnsubscribers = [];
