// supabase-local/gen-jwt.js
// Mint Supabase-compatible HS256 JWT (anon + service_role) dari JWT_SECRET.
// Tanpa dependency — memakai crypto bawaan Node. Dipanggil sekali oleh setup.sh
// di dalam container node throwaway. Output: dua baris KEY=VALUE.
const crypto = require("crypto");

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
  console.error("JWT_SECRET wajib diisi (minimal 32 karakter).");
  process.exit(1);
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function sign(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const data = `${encHeader}.${encPayload}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

const iat = Math.floor(Date.now() / 1000);
const exp = iat + 60 * 60 * 24 * 365 * 10; // 10 tahun

const anon = sign({ role: "anon", iss: "supabase", iat, exp });
const service = sign({ role: "service_role", iss: "supabase", iat, exp });

process.stdout.write(`ANON_KEY=${anon}\nSERVICE_ROLE_KEY=${service}\n`);
