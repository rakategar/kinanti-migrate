// src/utils/aiKeys.js
// Rotasi API key Gemini dari pool DB (tabel AiToken). Dipakai oleh generate-hots
// dan grading agar saat satu key kena limit (429) sistem otomatis pindah ke key
// berikutnya tanpa mengganggu jalannya sistem.
//
// Kontrak:
//  - getUsableGeminiKeys(prisma) -> [{ id, apiKey }]  (urut priority asc, LRU)
//  - markKeyLimited(prisma, id, errMsg)  -> tandai limited + cooldown
//  - markKeySuccess(prisma, id)          -> catat pemakaian sukses
//  - markKeyError(prisma, id, errMsg)    -> error non-limit (opsional)
//  - isQuotaError(err) -> boolean        -> layak rotasi key (bukan sekadar retry model)

const DEFAULT_COOLDOWN_MINUTES = 15;

function cooldownMs() {
  const m = Number(process.env.AI_KEY_COOLDOWN_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : DEFAULT_COOLDOWN_MINUTES) * 60 * 1000;
}

// Error limit/kuota dari Gemini → rotasi ke key berikutnya.
// Catatan: 503/overload TETAP ditangani sebagai retry level-model (isTransient),
// bukan rotasi key, karena itu masalah server bukan kuota key.
export function isQuotaError(err) {
  const m = String(err?.message || err || "");
  return /\b(429|quota|rate limit|rate-limit|exceeded|resource has been exhausted|too many requests)\b/i.test(
    m,
  );
}

/**
 * Ambil daftar key yang bisa dipakai sekarang, urut prioritas lalu LRU.
 * Jika tabel kosong / DB tak terjangkau → fallback ke GEMINI_API_KEY dari env
 * (kompatibel dengan setup lama). id=null menandakan key env (tak ditulis balik).
 */
export async function getUsableGeminiKeys(prisma) {
  try {
    const now = new Date();
    const rows = await prisma.aiToken.findMany({
      where: {
        active: true,
        provider: "gemini",
        OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: now } }],
      },
      orderBy: [{ priority: "asc" }, { lastUsedAt: "asc" }, { id: "asc" }],
      select: { id: true, apiKey: true },
    });
    const keys = rows.filter((r) => r.apiKey && r.apiKey.trim());
    if (keys.length > 0) return keys.map((r) => ({ id: r.id, apiKey: r.apiKey.trim() }));
  } catch (e) {
    console.warn("[aiKeys] Gagal baca pool AiToken, pakai env fallback:", e?.message);
  }
  const envKey = (process.env.GEMINI_API_KEY || "").trim();
  return envKey ? [{ id: null, apiKey: envKey }] : [];
}

export async function markKeyLimited(prisma, id, errMsg) {
  if (id == null) return;
  try {
    await prisma.aiToken.update({
      where: { id },
      data: {
        status: "limited",
        cooldownUntil: new Date(Date.now() + cooldownMs()),
        lastError: String(errMsg || "").slice(0, 500),
      },
    });
  } catch (e) {
    console.warn("[aiKeys] markKeyLimited gagal:", e?.message);
  }
}

export async function markKeySuccess(prisma, id) {
  if (id == null) return;
  try {
    await prisma.aiToken.update({
      where: { id },
      data: {
        status: "ok",
        cooldownUntil: null,
        lastError: null,
        lastUsedAt: new Date(),
        usageCount: { increment: 1 },
      },
    });
  } catch (e) {
    console.warn("[aiKeys] markKeySuccess gagal:", e?.message);
  }
}

export async function markKeyError(prisma, id, errMsg) {
  if (id == null) return;
  try {
    await prisma.aiToken.update({
      where: { id },
      data: { status: "error", lastError: String(errMsg || "").slice(0, 500) },
    });
  } catch (e) {
    console.warn("[aiKeys] markKeyError gagal:", e?.message);
  }
}
