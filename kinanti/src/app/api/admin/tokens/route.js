// app/api/admin/tokens/route.js
import { NextResponse } from "next/server";
import prisma from "@/config/prisma";
import { verifyAdminRequest } from "@/utils/adminAuth";

// Tampilkan key tersamar: hanya 4 karakter terakhir.
function maskKey(apiKey) {
  const s = String(apiKey || "");
  if (s.length <= 4) return "••••";
  return "••••••••" + s.slice(-4);
}

function toPublic(t) {
  return {
    id: t.id,
    label: t.label,
    provider: t.provider,
    keyMasked: maskKey(t.apiKey),
    priority: t.priority,
    active: t.active,
    status: t.status,
    lastError: t.lastError,
    cooldownUntil: t.cooldownUntil,
    usageCount: t.usageCount,
    lastUsedAt: t.lastUsedAt,
    createdAt: t.createdAt,
  };
}

export async function GET(req) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const tokens = await prisma.aiToken.findMany({
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  return NextResponse.json({ tokens: tokens.map(toPublic) });
}

export async function POST(req) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const label = String(body.label || "").trim();
  const apiKey = String(body.apiKey || "").trim();
  const priority = Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0;

  if (!label || !apiKey) {
    return NextResponse.json(
      { error: "Label dan API key wajib diisi." },
      { status: 400 },
    );
  }

  const created = await prisma.aiToken.create({
    data: { label, apiKey, priority, provider: "gemini" },
  });
  return NextResponse.json({ token: toPublic(created) }, { status: 201 });
}
