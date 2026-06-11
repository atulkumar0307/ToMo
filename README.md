# ToMo Backend (Phase 1)

Node.js backend with OTP authentication, JWT, Express, PostgreSQL, and Prisma.

## Setup

1. Copy environment file:

```bash
cp .env.example .env
```

2. Update `DATABASE_URL`, user JWT secrets, and admin JWT secrets in `.env`.

3. Install dependencies:

```bash
npm install
```

4. Run database migration:

```bash
npm run db:migrate
```

5. Start the server:

```bash
npm run dev
```

## Folder structure (modules)

```
src/
  routes/
    index.js               # /api/user, /api/admin
    user.routes.js         # User route group
  modules/
    auth/                  # User OTP + JWT
    admin/                 # Admin APIs
  middleware/
    auth.js                # User JWT
    adminAuth.js           # Admin JWT auth
```

## API structure

```
/api/user/auth/...
/api/user/profile/...
/api/user/verification/...
/api/user/activities/...

/api/admin/auth/...        (register, login, refresh-token, logout)
/api/admin/users/...
/api/admin/verifications/...
```

Import Postman files from `postman/`:
- `ToMo-API.postman_collection.json` — **complete collection** (all APIs, validation docs, test scripts, auto-save tokens/IDs)
- `ToMo-Local.postman_environment.json` — localhost
- `ToMo-Production.postman_environment.json` — Render

Postman → **Import** → select all 3 files → choose environment (top-right: **ToMo Local** or **ToMo Production**).

Collection includes validation examples (`[400]`, `[403]`) and auto-sets `activityStartTime`/`activityEndTime` for activity create/update.

## API Endpoints

| Method | Endpoint                 | Auth     |
| ------ | ------------------------ | -------- |
| GET    | `/health`                | No       |
| POST   | `/api/user/auth/send-otp`     | No       |
| POST   | `/api/user/auth/verify-otp`   | No       |
| POST   | `/api/user/auth/refresh-token`| No       |
| POST   | `/api/user/auth/logout`       | No       |
| GET    | `/api/user/auth/me`           | Bearer   |
| GET    | `/api/user/profile`           | Bearer   |
| PATCH  | `/api/user/profile`           | Bearer   |
| POST   | `/api/user/verification`      | Bearer   |
| GET    | `/api/user/verification`      | Bearer   |
| GET    | `/api/user/activities`        | Bearer   |
| GET    | `/api/user/activities/mine/hosted` | Bearer |
| GET    | `/api/user/activities/mine/joined` | Bearer |
| POST   | `/api/user/activities`        | Bearer   |
| GET    | `/api/user/activities/:id`    | Bearer   |
| PATCH  | `/api/user/activities/:id`    | Bearer   |
| DELETE | `/api/user/activities/:id`    | Bearer   |
| POST   | `/api/user/activities/:id/cancel` | Bearer |
| POST   | `/api/user/activities/:id/start` | Bearer |
| POST   | `/api/user/activities/:id/complete` | Bearer |
| POST   | `/api/user/activities/:id/join` | Bearer (verified) |
| POST   | `/api/user/activities/:id/withdraw` | Bearer |
| GET    | `/api/user/activities/:id/participants` | Bearer (host) |
| POST   | `/api/user/activities/:id/participants/:userId/approve` | Bearer (host) |
| POST   | `/api/user/activities/:id/participants/:userId/reject` | Bearer (host) |
| POST   | `/api/admin/register`    | No       |
| POST   | `/api/admin/login`       | No       |
| POST   | `/api/admin/refresh-token` | No     |
| POST   | `/api/admin/logout`      | No       |
| GET    | `/api/admin/users`       | Admin Bearer |
| PATCH  | `/api/admin/users/:userId/block` | Admin Bearer |
| PATCH  | `/api/admin/users/:userId/profile` | Admin Bearer |
| PATCH  | `/api/admin/verifications/:verificationId` | Admin Bearer |

## Development OTP

Fixed OTP for MVP: `000000` (configurable via `DEV_OTP` in `.env`).

## OTP actions

Only allowlisted actions are accepted (currently: `LOGIN`). Send the same `action` on send-otp and verify-otp.

- **LOGIN** — unified sign-in: creates user if new, assigns a unique numeric `uid` (starting from 1), returns tokens and `isProfileCompleted` (default `false`). Blocked users (`isBlocked: true`) cannot send OTP, verify OTP, refresh tokens, or access protected routes.

## Postman Flow

1. `POST /api/user/auth/send-otp` with `{ "mobile": "9999999999", "action": "LOGIN" }`
2. `POST /api/user/auth/verify-otp` with `{ "mobile": "9999999999", "otp": "000000", "action": "LOGIN" }`
3. Use `accessToken` as `Authorization: Bearer <token>` for `GET /api/user/auth/me`
4. `POST /api/user/auth/refresh-token` with `{ "refreshToken": "..." }`
5. `POST /api/user/auth/logout` with `{ "refreshToken": "..." }`
6. `PATCH /api/user/profile` with Bearer token and profile fields (see below)

### Profile update

`PATCH /api/user/profile` — send any fields to update (at least one required). Use `multipart/form-data` when uploading a profile image:

| Field           | Type   | Notes                                      |
| --------------- | ------ | ------------------------------------------ |
| `fullName`      | string | 1–100 characters                           |
| `gender`        | string | `MALE` \| `FEMALE` \| `OTHER` \| `PREFER_NOT_TO_SAY` |
| `dateOfBirth`   | string | `YYYY-MM-DD`                               |
| `bio`           | string | Max 500 characters                         |
| `profileImage`  | file   | JPEG, PNG, or WebP — max 5MB               |

Uploaded images are stored under `uploads/profiles/` and exposed at `/uploads/profiles/<filename>`. The saved path is returned as `profileImagePath` on the user object.

`isProfileCompleted` is set to `true` on successful profile update. `isProfileVerified` stays `false` by default until admin approves the verification images.

### Verification images

`POST /api/user/verification` — upload 3–5 selfie images for profile verification.

- **Body:** `multipart/form-data`
- **Field:** `verificationImages` (files, 3–5) — JPEG, PNG, or WebP, max 5MB each
- **Status:** `PENDING` | `APPROVED` | `REJECTED`
- **remark:** set by admin when rejecting (shown to user on status check)

`GET /api/user/verification` — returns the latest verification submission with `images[]` for the logged-in user.

### Activities

**View/browse activities:** any logged-in user (discovery, get by id, my hosted/joined).

**Create activity:** verified profile required (`isProfileVerified: true`).

**Single vs group:** no separate field — `maxParticipants: 2` = single, `3–20` = group. Filter discovery with `?size=single` or `?size=group`.

**Time rules:** `startTime` must be 30 minutes to 24 hours from now. Duration 30 minutes to 8 hours.

#### Create — `POST /api/user/activities`

Publishes immediately as `PUBLISHED`. Host is auto-added as first approved participant.

Each activity gets a numeric `aid` (starting from 1) and a display code `activityCode` in responses (e.g. `ACT-1`, `ACT-2`). The UUID `id` is still used in API URLs.

Host cannot create (or edit into) a time slot that overlaps another hosted activity in `PUBLISHED` or `ACTIVE` status (`409` if conflict).

```json
{
  "title": "Coffee after work",
  "description": "Quick coffee near office. Casual chat welcome.",
  "category": "COFFEE",
  "locationName": "Blue Tokai Saket",
  "address": "Select Citywalk, Saket",
  "city": "Delhi",
  "latitude": 28.5244,
  "longitude": 77.2066,
  "startTime": "2026-06-15T17:30:00.000Z",
  "endTime": "2026-06-15T18:30:00.000Z",
  "maxParticipants": 4
}
```

Categories: `COFFEE` | `WALKING` | `SPORTS` | `GYM` | `STUDY` | `COWORKING` | `DINING` | `TRAVEL` | `ENTERTAINMENT` | `OTHER`

#### Discovery — `GET /api/user/activities`

Query: `page`, `limit`, `category`, `size` (`single`|`group`), `city`, `latitude`+`longitude`+`radiusKm`.

Returns `PUBLISHED` activities only.

#### Host lists — `GET /api/user/activities/mine/hosted`

All activities created by the host (including `DELETED`).

#### Joined list — `GET /api/user/activities/mine/joined`

Activities the user requested or joined. Each item includes `participantStatus` (`PENDING`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `EXPIRED`).

#### Activity detail — `GET /api/user/activities/:id`

Returns `activity` plus `myParticipation` (`status`, `isHost`) for the logged-in user.

#### Join flow (joiner)

| Action | Endpoint | Rules |
| ------ | -------- | ----- |
| Request join | `POST /api/user/activities/:id/join` | Verified user; activity `PUBLISHED`; not host; not full; `now < endTime`; no other approved join overlapping this time (`409`) |
| Withdraw | `POST /api/user/activities/:id/withdraw` | Own `PENDING` request only |
| Re-request | `POST /join` again | Allowed after `REJECTED`, `WITHDRAWN`, or `EXPIRED` |

#### Join flow (host)

| Action | Endpoint | Rules |
| ------ | -------- | ----- |
| List requests | `GET /api/user/activities/:id/participants` | Returns `pending[]` and `approved[]` (non-host) |
| Approve | `POST /api/user/activities/:id/participants/:userId/approve` | `PENDING` → `APPROVED` if spots left; joiner must not already be approved for another overlapping `PUBLISHED`/`ACTIVE` activity (`409`) |
| Reject | `POST /api/user/activities/:id/participants/:userId/reject` | `PENDING` → `REJECTED` |

Pending join requests are auto-marked `EXPIRED` when the activity expires unstarted.

#### Lifecycle (host)

| Action | Endpoint | When |
| ------ | -------- | ---- |
| Edit | `PATCH /api/user/activities/:id` | `PUBLISHED`, no pending/approved joiners |
| Delete | `DELETE /api/user/activities/:id` | `PUBLISHED`, no joiners → `DELETED` (host only) |
| Cancel | `POST /api/user/activities/:id/cancel` | `PUBLISHED`, has joiners → `CANCELLED` |
| Start | `POST /api/user/activities/:id/start` | `PUBLISHED` → `ACTIVE` |
| Complete | `POST /api/user/activities/:id/complete` | `ACTIVE` → `COMPLETED` |

Unstarted activities past `endTime` are auto-marked `EXPIRED` (background job, every 60s).

### Admin APIs

**Register** — `POST /api/admin/register`

```json
{
  "email": "admin@tomo.com",
  "password": "securepass123",
  "fullName": "Admin User"
}
```

**Login** — `POST /api/admin/login`

```json
{
  "email": "admin@tomo.com",
  "password": "securepass123"
}
```

Returns `accessToken`, `refreshToken`, and `admin` object. Use `Authorization: Bearer <adminAccessToken>` for protected admin routes.

**List users** — `GET /api/admin/users?page=1&limit=20`

Returns users with `latestVerification` (most recent image submission).

**Block / unblock user** — `PATCH /api/admin/users/:userId/block`

```json
{ "isBlocked": true }
```

Blocking also revokes all active refresh tokens for that user.

**Update user profile** — `PATCH /api/admin/users/:userId/profile`

Same fields as user profile update (`fullName`, `gender`, `dateOfBirth`, `bio`, `profileImage`) plus admin fields `isProfileCompleted`, `isProfileVerified`. Supports `multipart/form-data`.

**Review verification** — `PATCH /api/admin/verifications/:verificationId`

Approve:
```json
{ "status": "APPROVED" }
```
Sets submission status to `APPROVED` and user `isProfileVerified` to `true`.

Reject:
```json
{
  "status": "REJECTED",
  "remark": "Images unclear. Please re-upload in good lighting."
}
```
Sets submission status to `REJECTED`. `remark` is required and shown to the user on their next status check.
