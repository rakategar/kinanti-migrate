// src/utils/adminAuth.js
// Auth ringan & terpisah dari NextAuth (guru/siswa) khusus dashboard token AI (/admin).
// Kredensial dari env (default: admin / kekuatanai). Sesi disimpan di cookie httpOnly
// berisi JWT yang ditandatangani dengan NEXTAUTH_SECRET.
import jwt from "jsonwebtoken";

export const ADMIN_COOKIE = "kinanti_admin";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 jam

function secret() {
  return process.env.NEXTAUTH_SECRET || "kinanti-admin-fallback-secret";
}

export function adminUsername() {
  return process.env.ADMIN_USERNAME || "admin";
}

export function verifyCredentials(username, password) {
  const u = process.env.ADMIN_USERNAME || "admin";
  const p = process.env.ADMIN_PASSWORD || "kekuatanai";
  return String(username) === u && String(password) === p;
}

export function signAdminToken() {
  return jwt.sign({ role: "admin", u: adminUsername() }, secret(), {
    expiresIn: MAX_AGE_SECONDS,
  });
}

// Baca & verifikasi cookie admin dari Request (route handler). Return payload atau null.
export function verifyAdminRequest(req) {
  try {
    const cookie = req.cookies?.get?.(ADMIN_COOKIE)?.value;
    if (!cookie) return null;
    const payload = jwt.verify(cookie, secret());
    return payload?.role === "admin" ? payload : null;
  } catch {
    return null;
  }
}

// Opsi cookie untuk NextResponse.cookies.set
export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}
