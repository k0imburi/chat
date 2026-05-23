# Flutter Admin Parity Checklist

This checklist compares `Web-Admin-Panel` with the current `ChatAndTipAdmin` build.

## Flutter modules identified

- `Dashboard`
  - user statistics
  - gender statistics
  - platform statistics
  - country statistics
- `Users`
  - searchable/filterable user list
  - verification toggle
  - user detail view
  - block / activate account
  - gallery video deletion
- `Reported Users`
  - report list
  - delete report
  - jump from report to user
- `Settings`
  - general app info
  - feature flags
  - billing/payment values
  - MPESA settings
  - PayPal settings
- `Push Notifications`
  - send a broadcast message
- `Mobile integration support`
  - R2-backed upload/delete endpoints
  - app info/settings endpoint
  - M-PESA STK initiation and callback handling
  - tip request endpoints
  - mobile JWT auth/session endpoints
  - social interaction endpoints for likes, matches, swipes, follows, and blocks
  - chat and message endpoints
  - mobile in-app notifications feed endpoints

## Next.js status

- `Dashboard`
  - implemented
  - expanded with user/platform/country statistics
- `Users`
  - implemented
  - detail view expanded with moderation and media controls
- `Reported Users`
  - implemented as `Reports`
  - report-to-user jump is already wired
- `Settings`
  - implemented with tabs
- `Push Notifications`
  - implemented as campaign-based notifications
- `Mobile integration support`
  - implemented for uploads, app info, M-PESA STK, wallet transactions, withdrawals, tip requests, mobile auth/session APIs, social interaction APIs, chat/message APIs, and mobile notification APIs

## Still not complete

- Exact Firebase analytics/stat buckets are not yet fully re-created field-for-field.
- Notification sending is recorded as campaigns, but external delivery providers are not wired yet.
- The mobile app still has broader Firebase-dependent flows outside admin scope:
  - final cleanup of remaining Firebase-backed helper/controller artifacts in Flutter
  - full wallet UI cutover in the Flutter client from Firebase listeners to the new MySQL-backed APIs
