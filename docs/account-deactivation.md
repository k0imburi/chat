# Account deactivation cleanup

Deactivation hides an account immediately and schedules personal-data cleanup 45 days later. A successful login before that deadline reactivates the account and cancels deletion.

Production must call `POST /api/jobs/accounts/cleanup` at least daily with `Authorization: Bearer $CRON_SECRET`. The endpoint is authenticated, idempotent, and handles up to 100 expired accounts per run. This repository does not prove that an external production scheduler is active, so configure the route in Railway or the deployment scheduler before release.

Cleanup anonymizes the user and removes public content and login-provider identities. Financial ledgers, payouts, bookings, and legally relevant records remain associated with the anonymized user ID.
