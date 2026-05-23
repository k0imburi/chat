# Mobile Backend Contract Audit

The Flutter client at `ChatAndTipApp` still relies on a broad Firebase data surface. While this admin rebuild is focused on the admin panel, these contracts were reviewed so shared backend expectations are not missed.

## Shared settings already reflected in Prisma

- `AppInfo/settings`
  - `appName`
  - `email`
  - `phone`
  - `address`
  - `currency`
  - `minimumTip`
  - `transactionFee`
  - `usdToKesRate`
  - `freeMemberSwipeLimit`
  - `showDiscoverAdAfterXswipes`
  - `allowVideoModeration`
  - `showAds`
  - `allowFreeAccess`
  - `allowVideoCall`
  - `allowVoiceCall`
  - `allowSendImages`
  - `maxVideosUpload`
  - payment credentials
  - R2 credentials

## Shared entities already reflected in Prisma

- `Users` -> `User`
- `Users.gallery/profileVideo/profileAvatarUrl` -> `UserMedia`
- `Reports` -> `Report`
- premium products -> `PaymentPlan`
- admin broadcast records -> `NotificationCampaign`
- user notifications -> `UserNotification`
- wallet entries -> `WalletTransaction`
- withdrawals -> `WithdrawalRequest`
- STK requests -> `MpesaPaymentRequest`

## Mobile-facing endpoints now implemented

- `POST /api/storage/upload`
  - uploads files to Cloudflare R2
- `POST /api/storage/delete`
  - deletes uploaded assets from Cloudflare R2
- `GET /api/app-info`
  - returns app settings the mobile client can consume
- `POST /api/lnmo/request-stk`
  - initiates M-PESA STK push using app-configured credentials
- `POST /api/lnmo/callbacks/default/default/stk`
  - receives Safaricom STK callbacks
- `GET /api/lnmo/check-stk`
  - returns normalized STK transaction status for polling
- `GET /api/wallet/transactions`
  - returns MySQL-backed wallet entries for a user
- `POST /api/wallet/transactions`
  - stores wallet ledger entries in MySQL
- `GET /api/wallet/withdrawals`
  - returns MySQL-backed withdrawal requests for a user
- `POST /api/wallet/withdrawals`
  - stores withdrawal requests in MySQL
- `GET /api/tip-requests`
  - returns tip requests for a receiver
- `POST /api/tip-requests`
  - creates a tip request record in MySQL
- `PATCH /api/tip-requests`
  - updates tip request status to sent/completed
- `GET /api/tip-requests/pending`
  - checks if a pending tip request exists for a sender/receiver pair
- `POST /api/mobile/auth/register`
  - creates a mobile app user and returns a JWT session token
- `POST /api/mobile/auth/login`
  - signs in an email/password mobile user and returns a JWT session token
- `POST /api/mobile/auth/provider-login`
  - upserts a provider-based mobile user and returns a JWT session token
- `GET /api/mobile/auth/me`
  - resolves the current mobile session from a bearer token
- `POST /api/mobile/auth/logout`
  - no-op logout endpoint for token-based mobile sessions
- `GET /api/likes?action=received&userId=...`
  - returns received likes with liker profile payloads
- `GET /api/likes?action=liked_videos&userId=...`
  - returns liked video IDs for discover/profile state
- `POST /api/likes`
  - toggles a video like and auto-creates a match on mutual interest
- `PATCH /api/likes`
  - marks a received like as viewed
- `GET /api/matches?userId=...`
  - returns user matches with matched profile payloads
- `PATCH /api/matches`
  - marks a match as viewed
- `DELETE /api/matches?userId=...&matchedUserId=...`
  - removes a match
- `GET /api/swipes?userId=...`
  - returns swiped user IDs
- `POST /api/swipes`
  - records a swipe event
- `GET /api/follows?action=followers&userId=...`
  - returns followers
- `GET /api/follows?action=following&userId=...`
  - returns following
- `GET /api/follows?action=suggestions&userId=...`
  - returns follow suggestions
- `GET /api/follows?action=status&followerId=...&followedId=...`
  - returns current follow status
- `GET /api/follows?action=counts&userId=...`
  - returns follower/following counts
- `POST /api/follows`
  - follows or unfollows a user
- `GET /api/blocks?action=list&userId=...`
  - returns blocked users
- `GET /api/blocks?action=status&userId1=...&userId2=...`
  - returns whether a user has blocked another user
- `POST /api/blocks`
  - blocks a user and clears connected follow/match/like state
- `DELETE /api/blocks?currentUserId=...&otherUserId=...`
  - unblocks a user
- `GET /api/mobile/chats`
  - returns the current user chat list with unread counters and peer profile payloads
- `PATCH /api/mobile/chats/{otherUserId}`
  - marks a chat as viewed and clears unread message counters
- `DELETE /api/mobile/chats/{otherUserId}`
  - archives a chat for the current user
- `GET /api/mobile/chats/{otherUserId}/messages`
  - returns the conversation message list and marks inbound messages as read
- `POST /api/mobile/chats/{otherUserId}/messages`
  - sends a text or image message through the MySQL-backed chat store
- `GET /api/mobile/notifications`
  - returns paginated in-app notifications with sender profile payloads where available
- `POST /api/mobile/notifications`
  - creates an in-app notification record for a target user
- `PATCH /api/mobile/notifications/{notificationId}`
  - marks an in-app notification as read
- `DELETE /api/mobile/notifications`
  - clears the current user notification feed

## Client app Firebase collections/subcollections still to replace in future backend work

- `Users/{id}/TipRequests`
- additional app-side listener flows that still read Firebase directly

## Immediate implication for admin work

- Admin settings and moderation screens are being built against the relational models above.
- The schema intentionally includes shared mobile settings so the client app can be migrated without reworking the admin again.
- Uploads are now positioned to use R2 rather than Firebase Storage.
- STK initiation is now handled by the Next.js backend using the configured M-PESA credentials.
- Wallet transactions and withdrawal requests now have MySQL-backed API endpoints.
- Tip requests now have MySQL-backed API endpoints.
- Mobile JWT session endpoints now exist for backend-driven auth/session cutover.
- Likes, matches, swipes, follows, and blocked users now have MySQL-backed API endpoints.
- Chats and messages now have MySQL-backed API endpoints.
- In-app notifications now have MySQL-backed API endpoints, and admin broadcast campaigns fan out into the mobile feed.
- The Flutter client has already been adjusted in key auth/profile/chat flows to accept backend ISO date payloads alongside legacy Firestore-shaped values.
- Before cutting over the mobile app fully off Firebase, the missing client collections above will need Next.js route handlers or a dedicated backend service layer with equivalent behavior.
