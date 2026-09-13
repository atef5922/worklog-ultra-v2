import { parseApiResponse } from "@/lib/api-client";

type LoginPayload = { email: string; password: string; remember: boolean };
type LoginResult = { success: boolean; message: string };

export async function requestLogin(payload: LoginPayload, fetcher: typeof fetch = fetch): Promise<LoginResult> {
  try {
    const response = await fetcher("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await parseApiResponse<Partial<LoginResult> & { message: string }>(
      response,
      "Sign-in is temporarily unavailable. Please try again shortly.",
    );
    return { success: response.ok && result.success === true, message: result.message };
  } catch {
    return { success: false, message: "Unable to connect to the server. Check your connection and try again." };
  }
}
