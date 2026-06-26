# ChatAndTip Payments, Callbacks and Full Testing Setup

Updated: 2026-06-25

This guide covers local development, staging, M-PESA callbacks, private storage, scheduled jobs and the full customer test flow. Stripe code is present but the provider is intentionally paused.

## 1. Where users top up

Users do **not** enter the admin panel.

1. In Flutter, the user opens **My ChatAndTip**.
2. They tap **Recharge**.
3. The authenticated app requests `POST /api/mobile/credits/checkout-link`.
4. The app opens the dedicated customer page at `https://YOUR_DOMAIN/checkout?t=...`.
5. The website exchanges that short-lived token for an HTTP-only cookie and immediately removes the token from the address bar.
6. The customer builds a mixed credit cart and pays with **M-PESA**. Card remains hidden until Stripe is resumed.
7. Credits are allocated only after the corresponding server callback confirms payment.

The admin panel remains for operations, review and reconciliation. It is not shown to customers.

### Important mobile-store restriction

The Recharge entry point described above must be enabled only on permitted distribution channels. For ordinary Google Play distribution, ChatAndTip credits are in-app digital goods and the app may not steer users to this web checkout unless ChatAndTip is enrolled in an eligible regional billing/link program and implements its required APIs, disclosure screens and reporting.

The independent web/PWA and direct-distribution Android build can expose Wallet/Top up prominently. Store builds require their own capability policy and potentially Google Play Billing/StoreKit.

## 2. Prerequisites

- Node.js version supported by the installed Next.js version.
- Flutter SDK and a device/emulator.
- MySQL database dedicated to development or staging.
- Public HTTPS deployment or tunnel for provider callbacks.
- Cloudflare R2 public bucket for ordinary public assets.
- Separate Cloudflare R2 private bucket for paid chat/KYC content.
- Safaricom Daraja sandbox application.
- Stripe account only when the paused card-payment phase is resumed.
- Agora project for voice/video calls.

References:

- Stripe Checkout Sessions: https://docs.stripe.com/payments/checkout-sessions
- Stripe webhook verification: https://docs.stripe.com/webhooks/signature
- Stripe fulfillment/testing: https://docs.stripe.com/checkout/fulfillment
- Stripe global availability: https://stripe.com/global
- Safaricom Daraja portal: https://developer.safaricom.co.ke/

## 3. Web environment variables

Create `chatandtip-web/.env.local` locally. Never commit real credentials. For hosted staging/production, add the same values to the platform's encrypted environment-variable manager.

```dotenv
DATABASE_URL="mysql://USER:PASSWORD@HOST:3306/chatandtip"
JWT_SECRET="replace-with-at-least-32-random-characters"
JWT_EXPIRES_IN="7d"
MOBILE_JWT_EXPIRES_IN="30d"
APP_URL="https://YOUR-PUBLIC-HTTPS-DOMAIN"
NEXT_PUBLIC_APP_NAME="ChatAndTip"

# Cloudflare R2
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="chatandtip-public"
R2_PRIVATE_BUCKET_NAME="chatandtip-private"
R2_PUBLIC_BASE_URL="https://public-assets.example.com"
R2_REGION="auto"

# Stripe test mode
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Jobs
CRON_SECRET="generate-a-long-random-secret"

# M-PESA B2C (payouts)
MPESA_B2C_INITIATOR_NAME="..."
MPESA_B2C_SECURITY_CREDENTIAL="..."
MPESA_B2C_SHORTCODE="..."
MPESA_ENABLED="true"
MPESA_CONFIG_SOURCE="env"
MPESA_CONSUMER_KEY="..."
MPESA_CONSUMER_SECRET="..."
MPESA_PASSKEY="..."
MPESA_SHORTCODE="..."
MPESA_STORE_NUMBER="..."
MPESA_SHORTCODE_TYPE="CustomerPayBillOnline"
MPESA_ENVIRONMENT="sandbox"

# Paused until resumed and re-audited
STRIPE_ENABLED="false"

# Agora
AGORA_APP_ID="..."
AGORA_APP_CERTIFICATE="..."
```

Production should use the deployment secret manager with `MPESA_CONFIG_SOURCE=env`. Database-backed settings remain a compatibility option, but secrets stored in ordinary application tables have a larger exposure surface and are not recommended for live credentials.

For this workspace, `.env.local` is already Git-ignored and is the correct place for local-only provider values. Add future Daraja secrets there yourself, one variable per line. Never paste them into Flutter configuration, browser code, tracked documentation, screenshots, or an admin settings form. If a credential is ever committed or shared beyond the intended team, rotate it in Daraja rather than merely deleting the text.

`MPESA_ENABLED` defaults to `true`, because M-PESA is the required first payment rail. This does not bypass configuration safety: capabilities and checkout remain unavailable until consumer key, consumer secret, shortcode, and passkey are all present. Stripe defaults to disabled.

Legacy database fields are:

- `mpesaConsumerKey`
- `mpesaConsumerSecret`
- `mpesaPasskey`
- `mpesaShortcode`
- `mpesaStoreNumber`
- `mpesaShortcodeType`
- `mpesaEnvironment` (`sandbox` or `live`)
- `usdToKesRate` (required for tips and the USD 40 payout threshold)

## 4. Database setup

Do not point the first migration test at production.

```bash
cd chatandtip-web
npm install
npx prisma generate
npx prisma migrate status
npx prisma migrate deploy
```

### Local validation commands

Before provider testing, run the safe local checks:

```bash
cd chatandtip-web
npm run test:readiness
npm run test:local
npm run build
```

If your local `DATABASE_URL`/`JWT_SECRET` live in `.env.railway` instead of `.env.local`, use the safe env-file wrapper rather than shell-sourcing the file:

```bash
cd chatandtip-web
npm run build:railway-local
npm run start:railway-local
```

This wrapper parses quoted/spaced values without printing secrets.

`npm run test:readiness` does not print secrets. It checks whether local/hosted environment variables are present for core app sessions, M-PESA STK, R2, jobs, Agora and B2C payouts.

Current expected readiness blockers until you add provider values:

- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `R2_PRIVATE_BUCKET_NAME`
- `MPESA_B2C_INITIATOR_NAME`
- `MPESA_B2C_SECURITY_CREDENTIAL`
- `MPESA_B2C_SHORTCODE`

Safe code checks can pass while these are missing, but end-to-end payments, private chat/KYC uploads and automatic payouts will fail closed.

### KYC upload testing

After the migration and R2 values are present:

1. Sign in to the customer web app.
2. Open `/wallet`.
3. Upload ID front, ID back and selfie in the Payout readiness card.
4. Confirm the KYC status becomes pending.
5. Sign in as an admin on `admin.chatandtip.com` or the local admin host.
6. Open `/creator-verifications`.
7. Use the document **View** links; each link should authorize the admin and redirect to a short-lived private R2 signed URL.

The browser should never receive a public URL for KYC files.

The monetization migration is:

```text
prisma/migrations/20260624090000_chatandtip_monetization/migration.sql
```

This project has historical migration/schema drift. Before applying to an existing environment:

1. Take a database backup.
2. Run `npx prisma migrate status`.
3. Compare existing tables and columns with the migration.
4. Test on a restored staging copy.
5. Resolve already-existing columns/tables deliberately; do not mark a failed production migration as applied without confirming every object.

For the currently configured Railway database, `npx prisma migrate status` reports that `20260624090000_chatandtip_monetization` has not been applied yet. Apply it only after confirming that the target is staging or that a current backup exists.

## 5. Public HTTPS URL for local callbacks

M-PESA and Stripe cannot call `localhost` directly. Use a staging deployment or HTTPS tunnel.

Example using Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

Set `APP_URL` to the resulting HTTPS origin, restart the web server, and update provider callback registrations. The URL must remain stable for reliable testing; a permanent staging subdomain is preferable.

## 6. M-PESA STK setup and callbacks

### Existing functional PayBill: sandbox-to-production onboarding

A functional PayBill confirms that the client can collect customer-initiated PayBill payments. It does not by itself confirm that the shortcode is enabled for Daraja Lipa Na M-PESA Online (STK Push), transaction query, C2B callbacks, or B2C payouts.

Use this sequence:

1. The client creates or controls the Daraja company account using an official business email at `https://developer.safaricom.co.ke/`.
2. Add the developer/integrator through the client's controlled process; do not leave production credentials owned only by a developer's personal Daraja account.
3. Create a sandbox app and select Authorization, Lipa Na M-PESA Online/STK Push, and Lipa Na M-PESA Online Query. Add C2B only if ChatAndTip will also reconcile payments that users initiate manually by entering the PayBill number.
4. Test exclusively with Daraja's sandbox base URL, sandbox consumer key/secret, sandbox shortcode and sandbox passkey. Never combine a live PayBill with sandbox credentials.
5. Once callback, query, replay and reconciliation tests pass, use Daraja's Go Live/production onboarding for the sandbox-tested app.
6. During production onboarding, select/link the client's existing PayBill and complete the business/shortcode verification required by Safaricom. The PayBill owner or organization administrator may need to authorize this.
7. Confirm that Safaricom has enabled the PayBill for Lipa Na M-PESA Online and has issued the production passkey. A production consumer key/secret without the correct production passkey and shortcode is insufficient.
8. Configure production only through the deployment secret manager and protected server settings. Do not place credentials in Flutter, browser code, source control, screenshots, chat, or ordinary logs.
9. Run a small controlled live transaction, verify it in the M-PESA organization portal and application ledger, then test reconciliation before increasing traffic.

For a PayBill STK request, the production configuration is normally:

```text
BusinessShortCode / PartyB: client's actual PayBill
TransactionType: CustomerPayBillOnline
AccountReference: short customer/order reference, not sensitive personal data
CallBackURL: https://chatandtip.com/api/lnmo/callbacks/default/default/stk
Environment: live
```

Production and sandbox credentials must never be interchangeable:

| Item | Sandbox | Production |
|---|---|---|
| API host | Daraja sandbox host | Safaricom production host |
| Consumer key/secret | Sandbox app | Approved production app |
| Shortcode | Daraja test shortcode | Client's verified PayBill |
| Passkey | Sandbox passkey | Passkey issued for the live shortcode |
| Transactions | Simulated/test | Real customer funds |
| Callback | Public HTTPS test/staging URL | Stable production HTTPS URL |

Information to collect from the client without asking them to send secrets through insecure channels:

- Legal business name and Daraja account owner.
- Existing PayBill shortcode.
- Organization-portal administrator contact.
- Confirmation whether Lipa Na M-PESA Online is already enabled.
- Confirmation whether a production passkey already exists.
- Settlement account and reconciliation contact.
- Expected customer statement/PayBill account-reference format.
- Whether manual PayBill payments must also be ingested through C2B confirmation/validation callbacks.
- Whether payouts are required; B2C is a separate onboarding and credential set.

Do not assume the collection PayBill can perform B2C. Safaricom must enable the appropriate B2C product and provide an initiator name and encrypted security credential; the business may need a separately funded disbursement shortcode/account.

### STK request lifecycle

1. Customer chooses M-PESA on `/checkout`.
2. The server requests an STK push from Daraja.
3. Daraja immediately returns `CheckoutRequestID`; the purchase remains `PENDING`.
4. The phone displays the M-PESA PIN prompt.
5. Daraja posts the final result to the callback URL.
6. The callback updates `MpesaPaymentRequest` and finalizes the matching credit or tip purchase idempotently.

### STK callback URL

```text
https://YOUR_DOMAIN/api/lnmo/callbacks/default/default/stk
```

The application sends this URL in every STK request using `APP_URL`. It is not a browser return page.

### What to verify

- The callback returns HTTP 200 with `ResultCode: 0` quickly.
- `MpesaPaymentRequest.status` becomes `SUCCESS`, `FAILED`, or `CANCELLED`.
- A successful credit purchase changes `CreditPurchase.status` to `SUCCESS` and `allocated` to `true`.
- Reposting the same callback does not allocate credits twice.
- A cancelled/failed request never allocates credits.
- Do not manually credit a purchase merely because the browser polling timed out.

### M-PESA sandbox test

1. Set `mpesaEnvironment` to `sandbox`.
2. Use sandbox consumer key, secret, shortcode and passkey from Daraja.
3. Confirm `APP_URL` is public HTTPS.
4. Start the web app.
5. Open Recharge from Flutter and choose M-PESA.
6. Complete the sandbox flow.
7. Inspect `MpesaPaymentRequest`, `CreditPurchase`, `CreditLedger` and `CreditAccount`.
8. Replay the captured callback once and confirm balances do not change again.

Do not log consumer secrets, passkeys, full callback payloads containing personal data, or customer PIN information.

## 7. M-PESA B2C payout callbacks

Daily eligible payouts are submitted by the protected payout job. Daraja calls one of these endpoints:

```text
Result URL:  https://YOUR_DOMAIN/api/mpesa/b2c/result
Timeout URL: https://YOUR_DOMAIN/api/mpesa/b2c/timeout
```

The result handler marks reserved earning lots `PAID` only after a successful provider result. A timeout/failure releases them to `AVAILABLE`. Three recent failed daily attempts pause the payout profile for investigation.

Before production, verify the exact B2C product, shortcode, initiator and security credential with Safaricom. STK credentials alone are not sufficient for B2C.

## 8. Stripe card setup

Card recharge uses Stripe-hosted Checkout. Card details never pass through ChatAndTip servers.

### Dashboard setup

1. Create or activate a Stripe account in test mode.
2. Copy the test secret key into `STRIPE_SECRET_KEY`.
3. In Stripe Workbench/Webhooks, create an endpoint:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

4. Subscribe to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
```

5. Reveal the endpoint signing secret and set `STRIPE_WEBHOOK_SECRET`.

The webhook verifies the raw request body, `Stripe-Signature`, five-minute timestamp tolerance, Checkout Session ID, internal purchase ID, KES currency and exact amount before allocating credits.

### Local Stripe CLI test

```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the `whsec_...` printed by that CLI process as the local `STRIPE_WEBHOOK_SECRET`; it differs from the Dashboard endpoint secret.

Use Stripe's standard successful test card:

```text
4242 4242 4242 4242
Any future expiry
Any three-digit CVC
Any postal code
```

Test these cases:

- Successful card payment allocates once.
- Closing/cancelling Stripe leaves the purchase unallocated.
- Re-delivered webhook remains idempotent.
- Invalid signature returns HTTP 400.
- Correct signature with incorrect amount/currency is rejected.
- Browser success return without webhook confirmation stays pending; the return URL alone cannot allocate credits.

## 9. Private R2 verification

`R2_PRIVATE_BUCKET_NAME` must identify a non-public bucket.

For browser-based customer uploads such as KYC, configure CORS on the public and private R2 buckets to allow the deployed customer origin to `PUT` with `Content-Type`. Keep the allowed origin narrow; use the exact staging/production origin rather than `*` for production.

Example staging CORS shape:

```json
[
  {
    "AllowedOrigins": ["https://staging.chatandtip.com"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

1. Disable public access and custom public domains on that bucket.
2. Upload a locked chat image.
3. Inspect the chat API as the recipient before unlock: no object key, signed URL, original URL, caption, link metadata or text should appear.
4. Attempt direct bucket access and confirm denial.
5. Unlock once and confirm a short-lived signed URL appears.
6. Refresh after expiry and confirm a new signed URL is issued without another charge.

If `R2_PRIVATE_BUCKET_NAME` is omitted, the code can fall back to the configured bucket; do not enable paid media in production until a truly private bucket is configured.

## 10. Scheduled jobs

All job routes require:

```http
Authorization: Bearer YOUR_CRON_SECRET
```

Configure the deployment scheduler:

| Schedule | Method and URL | Purpose |
|---|---|---|
| Every minute | `POST /api/jobs/broadcasts/deliver` | Deliver one broadcast batch |
| Every minute | `POST /api/jobs/bookings/reconcile` | Expiry, reminders, lateness, no-shows, settlement |
| Every minute | `POST /api/jobs/payments/reconcile` | Retry verified M-PESA callback reconciliation without granting optimistically |
| Daily at 02:00 Africa/Nairobi | `POST /api/jobs/payouts/daily` | Mature/check and submit eligible payouts |

02:00 Africa/Nairobi is 23:00 UTC on the preceding day while Nairobi remains UTC+3.

## 11. End-to-end application test order

### Recharge

- Open My ChatAndTip → Recharge.
- Confirm the page is `/checkout`, not an admin URL.
- Confirm `t` disappears from the browser URL after exchange.
- Buy the minimum Key/ChatCredit cart by M-PESA.
- Repeat using Card.
- Confirm app balances refresh after returning.

### Paid replies

- Customer starts a new DM with a free IceBreaker.
- Creator sends text, image and link replies.
- Verify recipient API/realtime/push/chat preview does not leak content.
- First unlock consumes one Key.
- Later unlock consumes one ChatCredit.
- Simultaneously tap unlock on two devices; only one charge may occur.
- Confirm historical messages remain unlocked.

### Tips

- Open Pebble/Gem/Diamond selector.
- Complete M-PESA tip payment.
- Send six tips to the same creator within 24 hours.
- Confirm the sixth succeeds but its earning lot is `HELD`.
- Test admin release and refund-required decisions.

### Broadcasts

- Queue a campaign in admin.
- Run the broadcast job until complete.
- Confirm ChatAndTip thread, Notifications entry and unread indicators.
- Confirm composer is disabled.
- Open either copy and confirm both unread states clear.

### Notifications and sharing

- Test like, comment, new-post and updated-post notifications.
- Verify each opens the exact media.
- Delete/hide media and confirm the unavailable state.
- Share from both Home and Explore; verify the canonical `/reels/{mediaId}` URL.

### Calls

- Creator configures availability.
- Customer proposes voice and video slots.
- Confirm session credit is reserved, not consumed.
- Test approve, decline, 12-hour boundary and proposal expiry.
- Test both join, user no-show, creator two-minute fine, creator three-minute strike and creator early-end review.
- Confirm three active strikes suspend monetization for 72 hours.

### Earnings and payouts

- Verify earning lot `availableAt = settledAt + 30 days`.
- Advance test data past maturity.
- Approve KYC and verify payout phone by OTP.
- Confirm a changed number waits 24 hours.
- Confirm balances below USD 40 equivalent remain available.
- Run the payout job above threshold.
- Test success, timeout and three failed daily batches.

## 12. Production launch checklist

- [ ] Database backup and staging migration completed.
- [ ] `npm run build` succeeds in a clean environment.
- [ ] Flutter release builds succeed for Android and iOS.
- [ ] Production HTTPS `APP_URL` configured.
- [ ] Daraja production STK callback verified.
- [ ] Daraja B2C result/timeout URLs verified.
- [ ] Stripe live key and live webhook secret configured separately from test values.
- [ ] Private R2 bucket access verified.
- [ ] Agora production credentials verified.
- [ ] Cron routes protected and scheduled.
- [ ] Logs redact protected messages, URLs, tokens and payment secrets.
- [ ] Economy features enabled independently through rollout flags.
- [ ] Provider reconciliation and customer support runbooks assigned.
