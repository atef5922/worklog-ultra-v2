type ApiResponseFallback = {
  message: string;
};

export async function parseApiResponse<T extends ApiResponseFallback>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const raw = await response.text();

  if (!raw) {
    return { message: fallbackMessage } as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/html")) {
      return {
        message: response.ok
          ? fallbackMessage
          : "The server returned an unexpected page instead of JSON. Please try again.",
      } as T;
    }

    return { message: fallbackMessage } as T;
  }
}
