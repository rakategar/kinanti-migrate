// src/nlp/normalizer.js
// Normalisasi teks WA: lowercase, hilangkan tanda baca, mapping slang umum.

const SLANG = {
  gmn: "gimana",
  gmna: "gimana",
  gmnya: "gimana",
  ngumpulin: "kumpul",
  ngumpul: "kumpul",
  kumpulin: "kumpul",
  kumpulkan: "kumpul",
  mengumpulkan: "kumpul",
  kumpuk: "kumpul",
  kumpl: "kumpul",
  kmpul: "kumpul",
  kumpil: "kumpul",
  setor: "kumpul",
  submit: "kumpul",
  uplod: "upload",
  uplot: "upload",
  uploud: "upload",
  tgskah: "tugas",
  tgs: "tugas",
  tg: "tugas",
  tgas: "tugas",
  tugs: "tugas",
  tuags: "tugas",
  mapel: "mata pelajaran",
  pelajaran: "mata pelajaran",
  besuk: "besok",
  mau: "ingin",
  pengen: "ingin",
  pgn: "ingin",
  // kata ganti orang → "saya" (agar tidak dianggap kode & selaras dgn kata umum)
  sy: "saya",
  sya: "saya",
  aq: "saya",
  aku: "saya",
  gw: "saya",
  gue: "saya",
  // kata kerja umum fitur
  liat: "lihat",
  liht: "lihat",
  lht: "lihat",
  bikin: "buat",
  buatin: "buat",
  bikinin: "buat",
  bkin: "buat",
  detil: "detail",
  rekapan: "rekap",
  // afirmasi
  iya: "ya",
  iyaa: "ya",
  yoi: "ya",
  yup: "ya",
  // sapaan (agar classify sapaan_help lebih toleran)
  hallo: "halo",
  helo: "halo",
  hi: "halo",
  aslm: "assalamualaikum",
  assalamualaikum: "assalamualaikum",
};

function normalize(text) {
  if (!text) return "";
  // lowercase
  let s = String(text).toLowerCase();

  // hilangkan emoji & karakter non huruf/angka kecuali spasi - _ /
  s = s.replace(/[^\p{L}\p{N}\s\-_\/]/gu, " ");

  // normalisasi spasi
  s = s.replace(/\s+/g, " ").trim();

  // mapping slang
  s = s
    .split(" ")
    .map((w) => SLANG[w] || w)
    .join(" ");

  return s;
}

module.exports = { normalize };
