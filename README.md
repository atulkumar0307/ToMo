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
/api/admin/verification-videos/...
```

Import Postman files from `postman/`:
- `ToMo-API.postman_collection.json` — all APIs with docs and auto-save token scripts
- `ToMo-Local.postman_environment.json` — localhost
- `ToMo-Production.postman_environment.json` — Render

Postman → **Import** → select files → choose environment (top-right).

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
| POST   | `/api/user/verification/video`| Bearer   |
| GET    | `/api/user/verification/video`| Bearer   |
| POST   | `/api/user/activities`        | Bearer   |
| POST   | `/api/admin/register`    | No       |
| POST   | `/api/admin/login`       | No       |
| POST   | `/api/admin/refresh-token` | No     |
| POST   | `/api/admin/logout`      | No       |
| GET    | `/api/admin/users`       | Admin Bearer |
| PATCH  | `/api/admin/users/:userId/block` | Admin Bearer |
| PATCH  | `/api/admin/users/:userId/profile` | Admin Bearer |
| PATCH  | `/api/admin/verification-videos/:verificationId` | Admin Bearer |

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

`isProfileCompleted` is set to `true` on successful profile update. `isProfileVerified` stays `false` by default until admin approves the verification video.

### Verification video (live selfie)

`POST /api/user/verification/video` — upload a 5–10 second live selfie video for profile verification.

- **Body:** `multipart/form-data`
- **Field:** `verificationVideo` (file) — MP4, WebM, or MOV, max 50MB
- **Status:** `PENDING` | `APPROVED` | `REJECTED`
- **remark:** set by admin when rejecting (shown to user on status check)

`GET /api/user/verification/video` — returns the latest verification submission for the logged-in user.

### Create activity

`POST /api/user/activities` — create a published activity. Requires completed profile.

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

Host is auto-added as the first approved participant (`approvedCount: 1`).

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

Returns users with `latestVerification` (most recent video submission).

**Block / unblock user** — `PATCH /api/admin/users/:userId/block`

```json
{ "isBlocked": true }
```

Blocking also revokes all active refresh tokens for that user.

**Update user profile** — `PATCH /api/admin/users/:userId/profile`

Same fields as user profile update (`fullName`, `gender`, `dateOfBirth`, `bio`, `profileImage`) plus admin fields `isProfileCompleted`, `isProfileVerified`. Supports `multipart/form-data`.

**Review verification** — `PATCH /api/admin/verification-videos/:verificationId`

Approve:
```json
{ "status": "APPROVED" }
```
Sets video status to `APPROVED` and user `isProfileVerified` to `true`.

Reject:
```json
{
  "status": "REJECTED",
  "remark": "Face not clearly visible. Please re-record in good lighting."
}
```
Sets video status to `REJECTED`. `remark` is required and shown to the user on their next status check.
