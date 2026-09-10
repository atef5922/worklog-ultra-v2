import { NextResponse } from "next/server";

export function apiError(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}
