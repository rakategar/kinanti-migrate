// src/features/hotsGenerator.js (bot)
// Generator soal HOTS via Gemini. Port CommonJS dari web
// (/opt/kinanti/src/app/api/guru/generate-hots/route.js). Model Gemini disamakan.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const prisma = require("../config/prisma");
const {
  getUsableGeminiKeys,
  markKeyLimited,
  markKeySuccess,
  isQuotaError,
} = require("../utils/aiKeys");

const JENIS_VALID = ["Pilihan Ganda", "Uraian"];

const SYSTEM_PROMPT = `Kamu adalah pembuat soal HOTS (Higher Order Thinking Skills) profesional
untuk pendidikan Indonesia tingkat SMA/SMK.
Buat soal berdasarkan taksonomi Bloom level C4 (Analisis), C5 (Evaluasi), C6 (Kreasi).
Selalu kembalikan response dalam format JSON yang valid.

ATURAN PENULISAN RUMUS MATEMATIKA & KODE (WAJIB, agar rapi saat dicetak ke PDF):
- Rumus matematika: tulis memakai SIMBOL UNICODE langsung, mis.
  pangkat x², x³, xⁿ; indeks x₁, x₂, aₙ; akar √2, √(x+1); pecahan ½, ¾, atau (a+b)/c;
  operator × ÷ ± ≤ ≥ ≠ ≈ ∑ ∫ → ∞ ·; huruf Yunani π θ α β Σ Ω; serta ∈ ℝ, °, ∠.
- DILARANG KERAS menulis perintah LaTeX dengan backslash (mis. \\frac, \\sqrt, \\times,
  \\leq, \\pi) atau tanda dolar $...$, karena backslash merusak JSON. Selalu pakai
  simbol Unicode di atas, dan tulis pecahan sebagai "a/b" bila tidak ada simbol Unicode-nya.
- Potongan kode program: SELALU bungkus dalam blok berpagar tiga backtick
  disertai nama bahasa, contoh:
  \`\`\`python
  def f(x):
      return x * 2
  \`\`\`
  Pertahankan indentasi asli. Untuk menyebut nama variabel/fungsi di dalam
  kalimat, gunakan inline code satu backtick, mis. \`output\`.
- Untuk penekanan gunakan **teks tebal**. Jangan gunakan tabel markdown.`;

function buildUserPrompt({ mataPelajaran, judulSoal, deskripsi, jenisSoal, jumlahSoal }) {
  return `Buat ${jumlahSoal} soal HOTS jenis ${jenisSoal} untuk mata pelajaran ${mataPelajaran}.
Materi/konteks: ${deskripsi}

Untuk setiap soal, pilih SATU level Bloom konkret pada field "levelBloom": "C4", "C5", atau "C6" (jangan tulis "C4/C5/C6").

Tulis rumus matematika HANYA dengan simbol Unicode (mis. x², √, ≤, ≥, ≠, ±, π, ½, x₁),
JANGAN memakai LaTeX/backslash atau tanda dolar. Kode program dalam blok \`\`\`bahasa ... \`\`\`.

FORMAT JSON WAJIB:
{
  "judul": "${judulSoal}",
  "mataPelajaran": "${mataPelajaran}",
  "jenisSoal": "${jenisSoal}",
  "soal": [
    // Jika PILIHAN GANDA:
    {
      "nomor": 1,
      "levelBloom": "C4/C5/C6",
      "pertanyaan": "...",
      "opsi": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },
      "jawabanBenar": "A",
      "pembahasan": "..."
    },
    // Jika URAIAN:
    {
      "nomor": 1,
      "levelBloom": "C4/C5/C6",
      "pertanyaan": "...",
      "jawabanKunci": "...",
      "rubrikPenilaian": "...",
      "skorMaksimal": 20
    }
  ]
}
Kembalikan JSON valid saja, tanpa teks tambahan apapun.`;
}

// Perbaiki backslash yang bukan escape JSON valid menjadi backslash ganda.
function repairJsonBackslashes(text) {
  return text.replace(/\\(?!["\\/bfnrtu]|u[0-9a-fA-F]{4})/g, "\\\\");
}

function parseGeminiJson(raw) {
  let text = String(raw || "").trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return JSON.parse(repairJsonBackslashes(text));
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  const m = String(err?.message || "");
  return /\b(503|429|500|overloaded|high demand|Service Unavailable|unavailable|rate limit)\b/i.test(m);
}

// Model SAMA PERSIS dengan web.
const MODELS = ["gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-flash-latest"];

/**
 * Generate soal HOTS. Melempar Error dengan .transient=true jika Gemini sibuk.
 * @returns {Promise<Object>} data { judul, mataPelajaran, jenisSoal, soal: [...] }
 */
async function generateHotsQuestions({ mataPelajaran, judulSoal, deskripsi, jenisSoal, jumlahSoal }) {
  mataPelajaran = String(mataPelajaran || "").trim();
  judulSoal = String(judulSoal || "").trim();
  deskripsi = String(deskripsi || "").trim();
  jenisSoal = String(jenisSoal || "").trim();
  jumlahSoal = Number(jumlahSoal);

  if (!mataPelajaran || !judulSoal || !deskripsi || !jenisSoal) {
    throw new Error("Semua field wajib diisi.");
  }
  if (!JENIS_VALID.includes(jenisSoal)) {
    throw new Error("Jenis soal harus 'Pilihan Ganda' atau 'Uraian'.");
  }
  if (!Number.isInteger(jumlahSoal) || jumlahSoal < 1 || jumlahSoal > 20) {
    throw new Error("Jumlah soal harus berupa angka 1 sampai 20.");
  }
  // Ambil pool key (tabel AiToken; fallback GEMINI_API_KEY dari env bila kosong).
  const keys = await getUsableGeminiKeys(prisma);
  if (keys.length === 0) {
    throw new Error(
      "Belum ada token AI (Gemini) yang aktif. Tambahkan token di dashboard /admin.",
    );
  }

  const makeModel = (genAI, name) =>
    genAI.getGenerativeModel({
      model: name,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 32768,
        temperature: 0.7,
      },
    });

  const prompt = buildUserPrompt({ mataPelajaran, judulSoal, deskripsi, jenisSoal, jumlahSoal });

  // Loop model untuk satu key; kembalikan objek soal atau lempar lastErr.
  async function runModelLoop(genAI) {
    let parsedLocal = null;
    let lastErrLocal = null;
    for (const name of MODELS) {
      const model = makeModel(genAI, name);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          const raw = result.response.text();
          parsedLocal = parseGeminiJson(raw);
          if (parsedLocal && Array.isArray(parsedLocal.soal) && parsedLocal.soal.length > 0) {
            return parsedLocal;
          }
          parsedLocal = null;
          lastErrLocal = new Error("Struktur JSON tidak sesuai (field 'soal' kosong).");
        } catch (e) {
          lastErrLocal = e;
          if (isTransient(e)) {
            if (attempt < 1) await sleep(1000);
          } else {
            break;
          }
        }
      }
    }
    throw lastErrLocal || new Error("Semua model gagal menghasilkan soal.");
  }

  // Loop key: saat kena limit (429/kuota) tandai limited lalu pindah key berikutnya.
  let parsed = null;
  let lastErr = null;
  for (const k of keys) {
    const genAI = new GoogleGenerativeAI(k.apiKey);
    try {
      parsed = await runModelLoop(genAI);
      await markKeySuccess(prisma, k.id);
      break;
    } catch (e) {
      lastErr = e;
      if (isQuotaError(e)) {
        await markKeyLimited(prisma, k.id, e && e.message);
        continue;
      }
      break;
    }
  }

  if (!parsed) {
    const err = new Error(
      isTransient(lastErr)
        ? "Server AI (Gemini) sedang sibuk. Tunggu beberapa detik lalu coba lagi."
        : "Gemini gagal menghasilkan soal yang valid. Coba lagi.",
    );
    err.transient = isTransient(lastErr);
    throw err;
  }

  parsed.judul = parsed.judul || judulSoal;
  parsed.mataPelajaran = parsed.mataPelajaran || mataPelajaran;
  parsed.jenisSoal = parsed.jenisSoal || jenisSoal;
  return parsed;
}

module.exports = { generateHotsQuestions, JENIS_VALID };
