import { describe, it, expect } from "vitest";
import TeamEvent, { TEAM_EVENT } from "@/lib/server/mongoose/models/TeamEvent";

describe("TEAM_EVENT constants", () => {
  it("exposes the known event types", () => {
    expect(TEAM_EVENT.INVITE_SENT).toBe("invite_sent");
    expect(TEAM_EVENT.INVITE_REVOKED).toBe("invite_revoked");
    expect(TEAM_EVENT.INVITE_ACCEPTED).toBe("invite_accepted");
    expect(TEAM_EVENT.MEMBER_REMOVED).toBe("member_removed");
    expect(TEAM_EVENT.ROLE_CHANGED).toBe("role_changed");
    expect(TEAM_EVENT.TRANSFER_CREATED).toBe("transfer_created");
    expect(TEAM_EVENT.TRANSFER_DELETED).toBe("transfer_deleted");
  });

  it("the enum values are unique", () => {
    const values = Object.values(TEAM_EVENT);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("TeamEvent.toJsonAsClient", () => {
  // Mongoose casts `actor` to an ObjectId on assignment, so we can't
  // simulate a populated actor by setting it on a real instance.
  // Call the method directly with a plain `this` that mirrors the
  // populated document shape.
  const toJsonAsClient = TeamEvent.schema.methods.toJsonAsClient;

  it("serializes a populated actor", () => {
    const json = toJsonAsClient.call({
      _id: "ev1",
      type: "invite_sent",
      data: { email: "x@y.z" },
      actor: { _id: "user1", email: "actor@a.com", fullName: "Acme Actor" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(json.id).toBe("ev1");
    expect(json.type).toBe("invite_sent");
    expect(json.data.email).toBe("x@y.z");
    expect(json.actor).toEqual({
      id: "user1",
      email: "actor@a.com",
      fullName: "Acme Actor",
    });
  });

  it("returns actor: undefined when the field is an un-populated ObjectId (i.e. a string-like ref)", () => {
    const json = toJsonAsClient.call({
      _id: "ev2",
      type: "member_removed",
      data: { email: "ex@example.com" },
      actor: "507f1f77bcf86cd799439011", // string, not a populated object
      createdAt: new Date(),
    });
    expect(json.actor).toBeUndefined();
  });

  it("returns actor: undefined when not set at all (system event)", () => {
    const ev = new TeamEvent({ type: TEAM_EVENT.MEMBER_REMOVED });
    const json = ev.toJsonAsClient();
    expect(json.actor).toBeUndefined();
  });

  it("returns empty data object when none was supplied", () => {
    const ev = new TeamEvent({ type: TEAM_EVENT.INVITE_SENT });
    const json = ev.toJsonAsClient();
    expect(json.data).toEqual({});
  });
});
