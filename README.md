# The Backrooms: Last Exit

Phase 1 provides account access, friend and block management, private party
lobbies, team selection, ready checks, and the API/database foundation. It does
not start a playable match or implement game rendering, networking, or voice.

## Local development

Use Node.js 24 and pnpm 10. The local development environment uses PostgreSQL
for persisted data and Redis as the prepared cache/presence service for the
next phase. Phase 1 presence is stored in PostgreSQL and refreshed by the
signed-in client.

```sh
cp .env.example .env
docker compose up -d
npm run dev
```

Open `http://localhost:8080`. The local Caddy proxy forwards `/api/*` to the
Express service and all other paths to Vite. Vite hot reload is available at
the same URL. Set a private `SESSION_SECRET` of at least 32 bytes in `.env`;
never use the sample development value in a deployed environment.

To run the entire app stack inside Docker instead, use:

```sh
docker compose --profile app up --build
```

That profile applies the Drizzle schema to the local Compose database and
serves the app at `http://localhost:8081`. It is for local development only.
Do not point the Compose migration service at a production database.

Apply the schema to the Replit development database manually with:

```sh
pnpm --filter @workspace/db run push
```

This is an explicit development command; the API does not run DDL on startup.
The production schema is not changed by this command.

## Phase 1 implementation

- Username/password accounts use Argon2id password hashes and signed, seven-day
  JWT sessions in HttpOnly, SameSite cookies. Registration and login are
  rate-limited. Guest access creates a generated `Wanderer_XXXX` identity.
- Player usernames are unique without regard to case and limited to 3–16
  letters, numbers, or underscores.
- Friend requests, accepted friendships, and directional blocks are stored in
  PostgreSQL. Blocking removes an existing friendship and pending requests.
- Party codes are six characters. Private lobbies require a friendship with a
  current member to join by code; invites are restricted to unblocked friends.
- Co-op parties allow up to four players on Team 1. Team Race allows four teams
  of up to four players. The server checks capacity while serializing lobby
  membership/team changes.
- Lobby changes are polled through generated React Query hooks. Starting a
  party changes its lobby status to `starting`; it does not claim that a match
  server or gameplay session exists.

The Drizzle model is in `lib/db/src/schema/`; the corresponding SQL reference
is `lib/db/schema.sql`. `lib/api-spec/openapi.yaml` is the source of truth for
REST request/response contracts. Generated React Query and Zod clients are
updated with:

```sh
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

## REST surface

The API is mounted at `/api`; all routes below it except health and auth entry
points require the session cookie.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/healthz` | Health check |
| POST | `/api/auth/register` | Register a username/password account |
| POST | `/api/auth/guest` | Create a temporary guest identity |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Clear the session and mark the player offline |
| GET | `/api/auth/me` | Return the current player and refresh presence |
| GET, POST | `/api/friends` and `/api/friends/requests` | List friends and requests; send a request |
| POST | `/api/friends/requests/{requestId}/accept` | Accept a request |
| POST | `/api/friends/requests/{requestId}/decline` | Decline a request |
| DELETE | `/api/friends/{friendId}` | Remove a friend |
| GET, POST | `/api/blocks` | List blocks and block by username |
| DELETE | `/api/blocks/{playerId}` | Unblock a player |
| GET | `/api/parties/me` | Get the current lobby |
| POST | `/api/parties` | Create a party |
| POST | `/api/parties/join` | Join a party by code |
| GET, POST | `/api/parties/invitations` | List invitations and invite a friend |
| POST | `/api/parties/invitations/{invitationId}/accept` | Accept an invitation |
| POST | `/api/parties/invitations/{invitationId}/decline` | Decline an invitation |
| POST | `/api/parties/leave` | Leave a party |
| PATCH | `/api/parties/me/ready` | Set the caller's ready state |
| PATCH | `/api/parties/me/team` | Set the caller's team |
| PATCH | `/api/parties/me/mode` | Change lobby mode (leader only) |
| POST | `/api/parties/start` | Mark a ready lobby as starting (leader only) |
| GET | `/api/lobby/summary` | Read the menu's friend/request/invitation counts |

The future realtime message envelope is documented separately in
`docs/realtime-contracts.md`; a WebSocket server is not part of Phase 1.