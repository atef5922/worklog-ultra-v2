import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), verifyPassword: vi.fn(), createUserSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { user: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/auth/session", () => ({ createUserSession: mocks.createUserSession }));
import { POST } from "./route";

const account = { id: "user-test", email: "test@example.invalid", passwordHash: "hash-not-a-real-password", isActive: true, role: "employee" };
const request = (body: string) => new NextRequest("http://localhost/api/auth/login", { method: "POST", headers: {"Content-Type":"application/json"}, body });
const valid = () => request(JSON.stringify({email: account.email, password: "test-password", remember: true}));

describe("login route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findUnique.mockResolvedValue(account);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.createUserSession.mockResolvedValue(undefined);
  });
  it("returns JSON for malformed input without querying the database", async () => {
    const response = await POST(request("{"));
    expect(response.status).toBe(400);
    expect((await response.json()).success).toBe(false);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
  it("rejects invalid fields without creating a session", async () => {
    expect((await POST(request(JSON.stringify({email:"invalid",password:"short"})))).status).toBe(400);
    expect(mocks.createUserSession).not.toHaveBeenCalled();
  });
  it("rejects an unknown account", async () => {
    mocks.findUnique.mockResolvedValue(null);
    expect((await POST(valid())).status).toBe(400);
    expect(mocks.createUserSession).not.toHaveBeenCalled();
  });
  it("rejects a deactivated account", async () => {
    mocks.findUnique.mockResolvedValue({...account,isActive:false});
    expect((await POST(valid())).status).toBe(400);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
  it("rejects an incorrect password without creating a session", async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    expect((await POST(valid())).status).toBe(400);
    expect(mocks.createUserSession).not.toHaveBeenCalled();
  });
  it.each(["employee","team_head","admin","moderator","super_admin"])("logs in %s using the stored role", async role => {
    mocks.findUnique.mockResolvedValue({...account,role});
    const response = await POST(valid());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({success:true,message:"Login successful.",user:{role}});
    expect(mocks.createUserSession).toHaveBeenCalledWith(expect.objectContaining({userId:account.id,role,rememberMe:true}));
    expect(mocks.findUnique).toHaveBeenCalledWith({where:{email:account.email},select:{id:true,email:true,passwordHash:true,isActive:true,role:true}});
  });
  it("returns safe JSON when the database is unavailable", async () => {
    const spy = vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      mocks.findUnique.mockRejectedValue({code:"P2022",message:"private connection details"});
      const response = await POST(valid());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({success:false,message:expect.stringContaining("temporarily unavailable")});
      expect(mocks.createUserSession).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith("[auth/login] Sign-in unavailable","P2022");
    } finally { spy.mockRestore(); }
  });
  it("does not claim success when session creation fails", async () => {
    const spy = vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      mocks.createUserSession.mockRejectedValue(new Error("AUTH_SECRET is not configured"));
      expect((await POST(valid())).status).toBe(503);
    } finally { spy.mockRestore(); }
  });
});
