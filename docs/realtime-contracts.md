# Realtime message contracts (planned)

These are the versioned message shapes reserved for the later realtime phase.
Phase 1 has no WebSocket endpoint; account, friend, invitation, and lobby
operations currently use the REST routes in `lib/api-spec/openapi.yaml`.

## Envelope

Client and server messages use JSON:

```json
{
  "version": 1,
  "id": "client-generated-message-id",
  "type": "party:ready",
  "payload": { "ready": true }
}
```

Replies include `replyTo` with the request's `id`. Errors use
`{ "code": "NOT_IN_PARTY", "message": "Join a party first." }`. Unknown message
types or unsupported versions are rejected. The browser authenticates the
connection using its HttpOnly session cookie; clients never send passwords or
JWT secrets in message payloads. The server remains authoritative for identity,
friendship, membership, readiness, and team capacity.

## Client to server

| Type | Payload |
| --- | --- |
| `presence:ping` | `{}` |
| `party:join` | `{ "roomCode": "A1BC23" }` |
| `party:leave` | `{}` |
| `party:ready` | `{ "ready": true }` |
| `party:team` | `{ "teamSlot": 1 }` |
| `party:mode` | `{ "mode": "coop-squad" }` or `{ "mode": "team-race" }` |
| `party:start` | `{}` |
| `party:invite` | `{ "username": "Player_01" }` |
| `friend:request` | `{ "username": "Player_01" }` |
| `friend:accept` | `{ "requestId": "uuid" }` |
| `friend:decline` | `{ "requestId": "uuid" }` |

## Server to client

| Type | Payload |
| --- | --- |
| `session:ready` | `{ "userId": "uuid" }` |
| `presence:update` | `{ "userId": "uuid", "presence": "online" }` |
| `party:snapshot` | The current `Party` response shape from the REST contract |
| `party:member-joined` | A `PartyMember` |
| `party:member-left` | `{ "userId": "uuid" }` |
| `party:updated` | The current `Party` response shape |
| `party:started` | `{ "partyId": "uuid", "status": "starting" }` |
| `party:invitation` | A `PartyInvitation` |
| `friend:request-received` | A `FriendRequest` |
| `error` | `{ "code": "string", "message": "string" }` |

When this transport is implemented, its path must be registered with the API
artifact's proxy routes before the client attempts to connect.