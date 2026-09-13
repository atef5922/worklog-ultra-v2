import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), setCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.setCookie }) }));
vi.mock("@/lib/db", () => ({ db: { userSession: { create: mocks.create } } }));
import { createUserSession, verifySessionToken } from "./session";

const input = {sessionId:"session-test",userId:"user-test",role:"employee",email:"test@example.invalid"};

describe("login sessions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("AUTH_SECRET","isolated-unit-test-signing-secret-not-used-by-application");
    vi.stubEnv("NODE_ENV","test");
    mocks.create.mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("signs the correct identity and sets an HTTP-only session cookie", async () => {
    await createUserSession(input);
    const [name,token,options] = mocks.setCookie.mock.calls[0];
    expect(name).toBe("worklog_session");
    expect(options).toMatchObject({httpOnly:true,sameSite:"lax",path:"/",secure:false});
    expect(options.expires).toBeUndefined();
    expect(await verifySessionToken(token)).toMatchObject(input);
    expect(mocks.create).toHaveBeenCalledWith({data:expect.objectContaining({sessionId:input.sessionId,userId:input.userId})});
  });
  it("persists the cookie when remember-me is selected", async () => {
    await createUserSession({...input,rememberMe:true});
    const options = mocks.setCookie.mock.calls[0][2];
    expect(options.expires).toBeInstanceOf(Date);
    expect(options.expires.getTime()-Date.now()).toBeGreaterThan(29*24*60*60*1000);
  });
  it("does not insert an orphan session when the signing secret is missing", async () => {
    vi.stubEnv("AUTH_SECRET","");
    await expect(createUserSession(input)).rejects.toThrow("AUTH_SECRET is not configured");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("does not issue a cookie when session persistence fails", async () => {
    mocks.create.mockRejectedValue(new Error("database unavailable"));
    await expect(createUserSession(input)).rejects.toThrow("database unavailable");
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
});
