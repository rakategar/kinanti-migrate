// app/api/admin/logout/route.js
import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/utils/adminAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
