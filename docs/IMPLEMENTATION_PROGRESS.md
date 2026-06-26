# Implementation Progress

Canonical working plan: `../../IMPLEMENTATION_PLAN.md`

This tracked copy records the current repository milestone so progress survives branch changes and Codex resets.

Updated 2026-06-25:

- Economy assets, recharge, secure paid replies, private media, tips, broadcasts, exact-media navigation, profile counts and feed sharing are implemented.
- Call availability, reservations, settlements, no-shows, fines and strikes are implemented.
- Earning lots, KYC/payout contracts and M-PESA B2C jobs are implemented.
- Customer credit checkout uses M-PESA. Stripe code is retained but disabled and hidden until that phase resumes.
- Detailed provider and end-to-end test guide: `docs/PAYMENTS_AND_TESTING_SETUP.md`.
- Initial admin review queues are now available for KYC decisions, held-tip release/refund decisions, early-ended booking disputes and creator payout monitoring.
- First customer-facing Next.js/PWA app surfaces are now available: Discover/Home, Trending, Create, public profiles, Wallet, Alerts, Inbox, chat thread view, Account/Edit Profile, Availability, Sessions, Session Room and Book Creator. Exact reels support comments, likes, follows and sharing. Wallet shows credit/earning/payout history plus KYC object-key submission and M-PESA payout-number OTP forms. Create uploads public posts to R2; chat image attachments upload to private R2 and use entitlement-aware signed delivery. They reuse existing serializers/contracts and include graceful empty states while staging is not migrated.
- Remaining work: provider refund execution, richer admin filters/search/audit trails, app KYC/payout screens, automated integration tests and staging provider verification.
- Store compliance decision recorded: standard Play/App Store builds must not globally steer users to web payment. Plan now includes channel-aware mobile flavors and a customer web/PWA.
- Planned web domains: customer app on `chatandtip.com`, checkout/wallet under that origin, and isolated operations on `admin.chatandtip.com`.
- Approved conversion: full parity in gated slices, all eight locales from one canonical source, neutral Connections language, one hostname-aware deployment, and consumption-only store builds.
- Stripe is paused, server-disabled and hidden. M-PESA is the default enabled rail, but purchase capabilities remain unavailable until all required provider values are present.
- The supplied Daraja key pair is stored only in ignored `.env.local`. The matching shortcode and Lipa na M-PESA passkey are still required; no credential is committed.
- Current implementation slice: provider kill switches, payment-attempt/webhook audit models, STK Query verification, atomic credit/tip fulfillment, reconciliation job, shared eight-locale generator, customer PWA shell, initial hostname isolation and first admin finance/review queues.
- Customer/admin login now resolves by hostname and issues separate host-only session cookies with different token audiences/secrets.
- The local Apple Silicon Next.js SWC binary and lockfile metadata are repaired; the full Next.js 16.2.7 production build passes.
- PWA manifest, production service-worker registration, static asset caching and an offline fallback are implemented without caching API/authenticated responses.
- Initial admin Payment Reconciliation page shows the latest 100 attempts with masked phone/receipt values and a clear staging-migration gate.
- Flutter analysis reports no compile errors; the repository currently has 399 warning/info diagnostics to clean up separately.
- Connected database schema is behind the application schema. The monetization migration must be rehearsed on a backed-up staging copy before provider testing.
- 2026-06-25 checks after admin review queues: TypeScript, payment security tests, production build and whitespace checks pass. ESLint is blocked by an existing config circular-reference error in the ESLint 9/react setup before source linting begins.
- 2026-06-25 checks after customer PWA slice: TypeScript, production build and whitespace checks pass. Customer chat/alert routes are temporarily `/inbox` and `/alerts` because admin already owns `/chats` and `/notifications` in the current App Router tree.
- 2026-06-25 checks after customer PWA interactivity slice: TypeScript, payment security tests, production build and whitespace checks pass.
- 2026-06-25 checks after customer PWA page-completion loop: TypeScript, payment security tests, production build and whitespace checks pass. Remaining PWA polish is mostly host-path cleanup, calendar/Agora SDK UI, comment replies/reactions, filters, and production visual QA.
- 2026-06-25 testing-readiness loop: ESLint flat config repaired and safe local checks pass through `npm run test:local`. Added `npm run test:readiness`; it currently reports missing M-PESA shortcode/passkey, private R2 bucket and B2C payout credentials. Railway migration status still shows `20260624090000_chatandtip_monetization` unapplied. Local server smoke test passed on `http://localhost:3006`.
- 2026-06-25 app tie-together loop: checkout and tip APIs now accept either a short-lived mobile checkout token cookie or an authenticated customer-web session, so `/wallet -> /checkout` works as a native PWA path while Flutter token links remain supported. Added customer web signup and recovery pages, a web registration endpoint that issues the customer session cookie, and safe `.env.railway` build/start wrappers.
- 2026-06-25 priority hardening loop: Wallet KYC no longer asks users for object keys. Customer web now uploads ID front, ID back and selfie files to private R2 via customer-session presign/confirm APIs, then submits KYC through `/api/v1/kyc`. Admin KYC review now uses authorized two-minute signed private-file previews. Lint, TypeScript, focused payment tests and `build:railway-local` pass.
- 2026-06-25 product-readiness review: verified checkout/token + customer-session paths, callback-driven fulfillment, paid chat locking, broadcast delivery, exact-media sharing/navigation, KYC private upload and admin signed previews. Tightened `/api/admin/*` host isolation so admin APIs are hidden on the customer host, documented the required R2 CORS rule for browser uploads, and enforced private object-key storage for locked paid image replies. Checks still pass.
- 2026-06-26 domain/app cleanup: clarified Railway host behavior in code by treating `www.chatandtip.com` and apex `chatandtip.com` as customer hosts and only `admin.chatandtip.com` as admin. Flutter My ChatAndTip now shows balances without a Recharge/web-payment CTA, locked-reply insufficient-balance copy no longer points to web payments, Account Hub no longer mentions payment details on the website, and Discover search/filter results no longer show creator username branding. Home and Trending/Explore continue to pass the media share callback into the shared reel card.

At the beginning and end of future implementation sessions, update both this file and the canonical workspace plan.
