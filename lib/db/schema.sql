-- Canonical PostgreSQL schema for Phase 1. The Drizzle definitions in
-- lib/db/src/schema are the source used by the application and Docker migrate service.

CREATE TYPE presence_status AS ENUM ('online', 'offline', 'in-game');
CREATE TYPE friend_request_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE party_mode AS ENUM ('coop-squad', 'team-race');
CREATE TYPE party_status AS ENUM ('lobby', 'starting', 'in-game');
CREATE TYPE party_invitation_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL CHECK (username ~ '^[A-Za-z0-9_]{3,16}$'),
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  presence presence_status NOT NULL DEFAULT 'offline',
  character_skin TEXT NOT NULL DEFAULT 'wanderer',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT players_guest_password_check CHECK (
    (is_guest AND password_hash IS NULL) OR
    (NOT is_guest AND password_hash IS NOT NULL)
  )
);

CREATE TABLE friend_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status friend_request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT friend_requests_no_self_check CHECK (from_user_id <> to_user_id)
);
CREATE INDEX friend_requests_recipient_status_idx
  ON friend_requests(to_user_id, status, created_at);
CREATE INDEX friend_requests_sender_status_idx
  ON friend_requests(from_user_id, status);

CREATE TABLE friendships (
  user_a_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_a_id, user_b_id),
  CONSTRAINT friendships_no_self_check CHECK (user_a_id <> user_b_id)
);
CREATE INDEX friendships_user_b_idx ON friendships(user_b_id);

CREATE TABLE blocked_players (
  blocker_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocked_players_no_self_check CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocked_players_blocked_idx ON blocked_players(blocked_id);

CREATE TABLE parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE CHECK (room_code ~ '^[A-Z0-9]{6}$'),
  mode party_mode NOT NULL DEFAULT 'coop-squad',
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  status party_status NOT NULL DEFAULT 'lobby',
  leader_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX parties_leader_idx ON parties(leader_id);

CREATE TABLE party_members (
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES players(id) ON DELETE CASCADE,
  team_slot INTEGER NOT NULL DEFAULT 1,
  ready BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, user_id),
  CONSTRAINT party_members_team_slot_range_check CHECK (team_slot BETWEEN 1 AND 4)
);
CREATE INDEX party_members_party_team_idx ON party_members(party_id, team_slot);

CREATE TABLE party_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  from_user_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status party_invitation_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT party_invitations_no_self_check CHECK (from_user_id <> to_user_id)
);
CREATE INDEX party_invitations_recipient_status_idx
  ON party_invitations(to_user_id, status, created_at);
CREATE INDEX party_invitations_party_idx ON party_invitations(party_id);