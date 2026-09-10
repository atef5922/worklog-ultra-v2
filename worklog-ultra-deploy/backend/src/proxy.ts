import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const protectedPrefixes = ["/dashboard", "/admin"];

function isProtectedPath(pathname: string) {
  return pathname === "/" || protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

async function getRoleFromRequest(request: NextRequest) {
  const token = request.cookies.get("worklog_session")?.value;
  const secret = process.env.AUTH_SECRET;

  if (!token || !secret) {
    return null;
  }

  try {
    const result = await jwtVerify(token, new TextEncoder().encode(secret));
    return String(result.payload.role ?? "");
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = await getRoleFromRequest(request);
  const isLoggedIn = Boolean(role);

  if (isProtectedPath(pathname) && !isLoggedIn) {
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin") && !["admin", "manager"].includes(role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
