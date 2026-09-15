import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/auth/session", () => ({ clearUserSession: mocks.clear }));

import { POST } from "./route";

describe("logout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ sessionId: "session-1" });
    mocks.clear.mockResolvedValue(undefined);
  });

  it("clears the session and returns a LAN-safe relative redirect", async () => {
    const response = await POST();

    expect(mocks.clear).toHaveBeenCalledWith("session-1");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/auth/login");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
