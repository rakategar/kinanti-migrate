// src/utils/aiKeys.js (bot — CommonJS)
// Rotasi API key Gemini dari pool DB (tabel AiToken), dibagi dengan web lewat DB
// yang sama. Saat satu key kena limit (429) bot otomatis pindah ke key berikutnya.
//
// Kontrak sama dengan versi web (kinanti/src/utils/aiKeys.js).

const DEFAULT_COOLDOWN_MINUTES = 15;

function cooldownMs() {
  const m = Number(process.env.AI_KEY_COOLDOWN_MINUTES);
  return (Number.isFinite(m) && m > 0 ? m : DEFAULT_COOLDOWN_MINUTES) * 60 * 1000;
}

function isQuotaError(err) {
  const m = String((err && err.message) || err || "");
  return /\b(429|quota|rate limit|rate-limit|exceeded|resource has been exhausted|too many requests)\b/i.test(
    m,
  );
}

async function getUsableGeminiKeys(prisma) {
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
    console.warn("[aiKeys] Gagal baca pool AiToken, pakai env fallback:", e && e.message);
  }
  const envKey = (process.env.GEMINI_API_KEY || "").trim();
  return envKey ? [{ id: null, apiKey: envKey }] : [];
}

async function markKeyLimited(prisma, id, errMsg) {
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
    console.warn("[aiKeys] markKeyLimited gagal:", e && e.message);
  }
}

async function markKeySuccess(prisma, id) {
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
    console.warn("[aiKeys] markKeySuccess gagal:", e && e.message);
  }
}

async function markKeyError(prisma, id, errMsg) {
  if (id == null) return;
  try {
    await prisma.aiToken.update({
      where: { id },
      data: { status: "error", lastError: String(errMsg || "").slice(0, 500) },
    });
  } catch (e) {
    console.warn("[aiKeys] markKeyError gagal:", e && e.message);
  }
}

module.exports = {
  isQuotaError,
  getUsableGeminiKeys,
  markKeyLimited,
  markKeySuccess,
  markKeyError,
};
