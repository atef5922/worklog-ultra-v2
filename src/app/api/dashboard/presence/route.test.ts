import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    user: { findUnique: vi.fn() },
    employeePresence: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return { auth: vi.fn(), transaction: vi.fn(), tx };
});
vi.mock("@/lib/auth/server", () => ({ getServerAuthContext: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { $transaction: mocks.transaction } }));

import { POST } from "./route";
import { APP_ROLES } from "@/lib/auth/roles";

const userId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-16T09:55:00.000Z");
let stored: { meetingStartedAt: Date | null; lastSeenAt: Date } | null;

function request(action: string) {
  return new Request("http://localhost:3000/api/dashboard/presence", {
    method: "POST",
    headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}

async function post(action: string) {
  return POST(request(action));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  stored = null;
  const user = { id: userId, role: "employee", isActive: true };
  mocks.auth.mockResolvedValue({ user });
  mocks.tx.user.findUnique.mockResolvedValue(user);
  mocks.transaction.mockImplementation((callback) => callback(mocks.tx));
  mocks.tx.employeePresence.findUnique.mockImplementation(async () => stored);
  mocks.tx.employeePresence.upsert.mockImplementation(async ({ create, update }) => {
    stored = stored
      ? { ...stored, ...update }
      : { lastSeenAt: create.lastSeenAt, meetingStartedAt: create.meetingStartedAt };
    return stored;
  });
});
afterEach(() => vi.useRealTimers());

describe("meeting presence", () => {
  it.each(APP_ROLES)("lets an active %s start and end a meeting without attendance", async (role) => {
    const user = { id: userId, role, isActive: true };
    mocks.auth.mockResolvedValue({ user });
    mocks.tx.user.findUnique.mockResolvedValue(user);
    const started = await post("meeting_start");
    expect(started.status).toBe(200);
    expect((await started.json()).presence.meetingStartedAt).toBe(now.toISOString());
    expect((await post("heartbeat")).status).toBe(200);
    const ended = await post("meeting_end");
    expect(ended.status).toBe(200);
    expect((await ended.json()).presence.meetingStartedAt).toBeNull();
    expect(mocks.tx.$queryRaw).toHaveBeenCalled();
  });

  it("preserves a same-day meeting when Start is clicked twice", async () => {
    expect((await post("meeting_start")).status).toBe(200);
    vi.setSystemTime(new Date(now.getTime() + 60_000));
    const response = await post("meeting_start");
    expect((await response.json()).presence.meetingStartedAt).toBe(now.toISOString());
  });

  it("expires an unfinished meeting on the next Dhaka day", async () => {
    expect((await post("meeting_start")).status).toBe(200);
    vi.setSystemTime(new Date("2026-09-16T18:01:00.000Z"));
    const heartbeat = await post("heartbeat");
    expect((await heartbeat.json()).presence.meetingStartedAt).toBeNull();
  });

  it("requires an authenticated, still-active account", async () => {
    mocks.auth.mockResolvedValueOnce({ user: null });
    expect((await post("meeting_start")).status).toBe(401);
    mocks.tx.user.findUnique.mockResolvedValueOnce({ id: userId, isActive: false });
    expect((await post("meeting_start")).status).toBe(403);
  });

  it("rejects an invalid action and cross-origin request", async () => {
    expect((await post("unknown")).status).toBe(400);
    const crossOrigin = new Request("http://localhost:3000/api/dashboard/presence", {
      method: "POST",
      headers: { origin: "https://wrong.example", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "meeting_start" }),
    });
    expect((await POST(crossOrigin)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
