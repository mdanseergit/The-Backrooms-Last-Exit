import { pgEnum } from "drizzle-orm/pg-core";

export const presenceEnum = pgEnum("presence_status", [
  "online",
  "offline",
  "in-game",
]);
export const friendRequestStatusEnum = pgEnum("friend_request_status", [
  "pending",
  "accepted",
  "declined",
]);
export const partyModeEnum = pgEnum("party_mode", ["coop-squad", "team-race"]);
export const partyStatusEnum = pgEnum("party_status", [
  "lobby",
  "starting",
  "in-game",
]);
export const partyInvitationStatusEnum = pgEnum("party_invitation_status", [
  "pending",
  "accepted",
  "declined",
]);