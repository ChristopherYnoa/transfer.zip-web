import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the dependency before importing the SUT.
vi.mock("@/lib/server/wrappers/auth", () => ({
  useServerAuth: vi.fn(),
}));

import { useTeamAdminAuth } from "@/lib/server/wrappers/teamAdminAuth";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { ROLES } from "@/lib/roles";

const fakeAuth = (overrides) => ({
  token: "tok",
  id: "user1",
  user: { _id: "user1", role: ROLES.OWNER, ...overrides.user },
  team: { _id: "team1", ...overrides.team },
  ...overrides,
});

describe("useTeamAdminAuth", () => {
  beforeEach(() => {
    vi.mocked(useServerAuth).mockReset();
  });

  it("returns null when there is no logged-in user at all", async () => {
    vi.mocked(useServerAuth).mockResolvedValue(null);
    expect(await useTeamAdminAuth()).toBeNull();
  });

  it("returns null when the user has no team", async () => {
    vi.mocked(useServerAuth).mockResolvedValue({
      token: "tok",
      id: "u",
      user: { _id: "u", role: ROLES.OWNER },
      team: null,
    });
    expect(await useTeamAdminAuth()).toBeNull();
  });

  it("returns null when the user is a regular Member (no admin access)", async () => {
    vi.mocked(useServerAuth).mockResolvedValue(
      fakeAuth({ user: { role: ROLES.MEMBER }, team: {} })
    );
    expect(await useTeamAdminAuth()).toBeNull();
  });

  it("admits an Owner with isOwner=true", async () => {
    vi.mocked(useServerAuth).mockResolvedValue(
      fakeAuth({ user: { role: ROLES.OWNER }, team: {} })
    );
    const result = await useTeamAdminAuth();
    expect(result).not.toBeNull();
    expect(result.isOwner).toBe(true);
  });

  it("admits an Admin with isOwner=false", async () => {
    vi.mocked(useServerAuth).mockResolvedValue(
      fakeAuth({ user: { role: ROLES.ADMIN }, team: {} })
    );
    const result = await useTeamAdminAuth();
    expect(result).not.toBeNull();
    expect(result.isOwner).toBe(false);
  });

  it("forwards the full auth context (user, team, token) through", async () => {
    const authIn = fakeAuth({ user: { role: ROLES.ADMIN, email: "a@b.c" }, team: { name: "Acme" } });
    vi.mocked(useServerAuth).mockResolvedValue(authIn);
    const result = await useTeamAdminAuth();
    expect(result.user).toBe(authIn.user);
    expect(result.team).toBe(authIn.team);
    expect(result.token).toBe(authIn.token);
  });
});
