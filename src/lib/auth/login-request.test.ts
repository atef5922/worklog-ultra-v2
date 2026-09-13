import { describe, expect, it, vi } from "vitest";
import { requestLogin } from "./login-request";

const payload = { email: "test@example.invalid", password: "test-password", remember: false };
const fetchResponse = (response: Response) => vi.fn<typeof fetch>().mockResolvedValue(response);

describe("login request", () => {
  it("accepts only an explicit successful JSON response", async () => {
    const fetcher = fetchResponse(Response.json({ success: true, message: "Login successful." }));
    expect(await requestLogin(payload, fetcher)).toEqual({ success: true, message: "Login successful." });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify(payload) }));
  });
  it("shows credential validation errors", async () => {
    expect(await requestLogin(payload, fetchResponse(Response.json({ success: false, message: "Incorrect password." }, {status: 400})))).toEqual({ success: false, message: "Incorrect password." });
  });
  it("returns an actionable error for a disconnected server", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await requestLogin(payload, fetcher)).toEqual({ success: false, message: expect.stringContaining("Check your connection") });
  });
  it("does not treat an empty server error as a successful login", async () => {
    expect((await requestLogin(payload, fetchResponse(new Response(null, { status: 500 })))).success).toBe(false);
  });
  it("does not redirect after a non-JSON HTTP 200", async () => {
    expect((await requestLogin(payload, fetchResponse(new Response("<html>Login</html>", { headers: {"Content-Type":"text/html"} })))).success).toBe(false);
  });
  it("preserves the safe server-unavailable message", async () => {
    const message = "Sign-in is temporarily unavailable.";
    expect(await requestLogin(payload, fetchResponse(Response.json({ success: false, message }, { status: 503 })))).toEqual({ success: false, message });
  });
});
