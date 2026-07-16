// app/api/admin/tokens/[id]/route.js
import { NextResponse } from "next/server";
import prisma from "@/config/prisma";
import { verifyAdminRequest } from "@/utils/adminAuth";

export async function PATCH(req, { params }) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));

  const data = {};
  if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
  if (typeof body.apiKey === "string" && body.apiKey.trim()) data.apiKey = body.apiKey.trim();
  if (body.priority !== undefined && Number.isFinite(Number(body.priority)))
    data.priority = Number(body.priority);
  if (typeof body.active === "boolean") data.active = body.active;

  // Aksi "reset": bersihkan status limited & cooldown agar key bisa dipakai lagi.
  if (body.reset === true) {
    data.status = "ok";
    data.cooldownUntil = null;
    data.lastError = null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Tidak ada perubahan." }, { status: 400 });
  }

  try {
    const updated = await prisma.aiToken.update({ where: { id }, data });
    return NextResponse.json({
      token: {
        id: updated.id,
        label: updated.label,
        priority: updated.priority,
        active: updated.active,
        status: updated.status,
        cooldownUntil: updated.cooldownUntil,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Token tidak ditemukan." }, { status: 404 });
  }
}

export async function DELETE(req, { params }) {
  if (!verifyAdminRequest(req)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "ID tidak valid." }, { status: 400 });
  }
  try {
    await prisma.aiToken.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Token tidak ditemukan." }, { status: 404 });
  }
}
