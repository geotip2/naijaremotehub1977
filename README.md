# NaijaRemoteHub — standalone website + Firebase backend

This project keeps the public/member website in **one `index.html` file** and adds a Firebase Cloud Functions API for all privileged operations. It uses the supplied Firebase project and Paystack **public** key. The Paystack secret key is never stored in the HTML or GitHub.

## Business rules implemented

- One-time membership: **₦30,000** (NGN 3,000,000 kobo).
- Level 1 referral commission: **30% = ₦9,000**.
- Level 2 referral commission: **15% = ₦4,500**.
- Company retention: **55% = ₦16,500**.
- Commission is credited only after Paystack server verification. Payment processing is idempotent; webhook and browser return cannot credit the same reference twice.
- Points conversion price is controlled by an admin as **naira per point**.
- Members can buy points from the company pool using their naira wallet. Admin must mint points into the pool before members can buy them.
- Members can transfer points and naira wallet balances to another member.
- Materials marked free are visible to signed-in members; paid materials are returned only to paid members.
- Admin can mint/burn points, distribute points to all or selected members, publish tasks, approve/reject task submissions, post announcements and publish learning materials.

## Important: existing Firebase database

The original HTML you supplied used **Cloud Firestore**. This project therefore stores member profiles and ledgers in Firestore. Your supplied Realtime Database URL is retained in the Firebase client config, but this implementation does not use Realtime Database.

Existing legacy `users` documents are migrated lazily when a member dashboard is loaded. Old `balance` values are converted to kobo and old `ref_code`, `referred_by`, `is_paid` and `full_name` fields are mapped. Existing users should sign in and load their dashboard once before using the new wallet features.

## Deploy from your computer

1. Install Node.js 20 or later and Firebase CLI:

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. Open this project folder in a terminal and select the supplied Firebase project:

   ```bash
   firebase use --add
   ```

   Select `naijaremotehub-6f584`.

3. Install the Cloud Functions dependencies:

   ```bash
   cd functions
   npm install
   cd ..
   ```

4. Add your Paystack **secret key** to Firebase Secret Manager. Run this command and paste the secret key only into the secure prompt:

   ```bash
   firebase functions:secrets:set PAYSTACK_SECRET_KEY
   ```

   Do not put the secret key in `index.html`, GitHub, `firebase.json`, or this README.

5. Deploy the database rules, indexes, backend functions and website:

   ```bash
   firebase deploy --only firestore,functions,hosting
   ```

6. In Paystack Dashboard, set the webhook URL to:

   ```text
   https://naijaremotehub-6f584.web.app/api/paystack-webhook
   ```

   If you use a different Firebase Hosting domain, replace the domain accordingly. The webhook is verified with Paystack's HMAC-SHA512 signature and then the transaction is independently verified against Paystack's API.

7. Open the deployed website, create your own account, then make that account an administrator using the steps below.

## Create the first administrator

Admin access uses a Firebase Authentication **custom claim** (`admin: true`). A normal user cannot make themselves an administrator by editing Firestore.

- Find your account UID in Firebase Console → Authentication → Users.
- Create/download a Firebase service-account JSON from Project settings → Service accounts. Keep it outside this project folder and never upload it to GitHub.
- Set the environment variable to that file and run the script from the project root:

  macOS/Linux:

  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json"
  node set-admin.js YOUR_FIREBASE_AUTH_UID
  ```

  Windows PowerShell:

  ```powershell
  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\service-account.json"
  node set-admin.js YOUR_FIREBASE_AUTH_UID
  ```

- Sign out of NaijaRemoteHub and sign in again so Firebase refreshes your ID token. The Admin button should appear.

## GitHub

Commit `index.html`, `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `functions/`, `set-admin.js`, `.gitignore` and this README. Do **not** commit service-account JSON files, `.env` files, or secret keys.

## Notes and operational safeguards

- Firebase Authentication Email/Password sign-in must be enabled in Firebase Console.
- Firestore must be created in the Firebase project before first use.
- Cloud Functions deployment and Secret Manager require the Firebase project to use the Blaze billing plan. Pay-as-you-go billing may apply.
- Firestore client writes are denied by `firestore.rules`. The website calls the authenticated API; the Admin SDK performs wallet changes on the server.
- All wallet amounts are stored as integer kobo. Points are stored as integer quantities.
- The API limits a single mass distribution to 10,000 members and selected distribution to 300 email addresses per request. For a larger community, use smaller selected batches or a queued job system.
- This starter does not include bank withdrawals, KYC, dispute handling, tax reporting, or regulatory compliance workflows. Add and review those before offering cash-out services.
- The Firebase web API key and Paystack public key are public client identifiers, not secret credentials. Restrict the Firebase API key by allowed website domains in Google Cloud when appropriate.
