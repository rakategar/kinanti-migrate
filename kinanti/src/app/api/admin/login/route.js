// app/api/admin/login/route.js
import { NextResponse } from "next/server";
import {
  verifyCredentials,
  signAdminToken,
  ADMIN_COOKIE,
  adminCookieOptions,
} from "@/utils/adminAuth";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!verifyCredentials(username, password)) {
    return NextResponse.json(
      { error: "Username atau password admin salah." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, signAdminToken(), adminCookieOptions());
  return res;
}
