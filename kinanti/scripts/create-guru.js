/**
 * Bootstrap akun guru pertama.
 *
 * Dipanggil oleh setup.sh setelah `prisma db push`, karena pada database baru
 * tabel User kosong: halaman /register hanya membuat akun GURU saat
 * APP_MODE=development — pada mode production ia selalu membuat akun siswa.
 * Tanpa langkah ini tidak ada seorang pun yang bisa membuat tugas.
 *
 * Idempotent: bila nomor sudah terdaftar, akun tidak diubah (kecuali --force
 * yang akan mereset password & role menjadi guru).
 *
 *   node scripts/create-guru.js "<nama>" "<phone>" "<password>" [--force]
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const [nama, phoneRaw, password] = process.argv.slice(2);
  const force = process.argv.includes("--force");

  if (!nama || !phoneRaw || !password) {
    console.error(
      'Pemakaian: node scripts/create-guru.js "<nama>" "<phone>" "<password>" [--force]'
    );
    process.exit(2);
  }

  // Samakan format nomor dengan yang dipakai bot (62xxxxxxxxxxx, tanpa + / spasi).
  let phone = String(phoneRaw).replace(/[^0-9]/g, "");
  if (phone.startsWith("0")) phone = "62" + phone.slice(1);
  if (!phone.startsWith("62")) phone = "62" + phone;

  if (password.length < 6) {
    console.error("Password minimal 6 karakter.");
    process.exit(2);
  }

  const existing = await prisma.user.findUnique({ where: { phone } });

  if (existing && !force) {
    console.log(
      `SKIP: nomor ${phone} sudah terdaftar (${existing.nama}, role=${existing.role}). ` +
        "Gunakan --force untuk mereset password & role menjadi guru."
    );
    return;
  }

  const hashed = await bcrypt.hash(password, 10);

  if (existing) {
    await prisma.user.update({
      where: { phone },
      data: { nama, password: hashed, role: "guru", kelas: null },
    });
    console.log(`OK: akun ${phone} direset menjadi guru (${nama}).`);
    // Baris mesin-terbaca: dipakai setup.sh untuk menampilkan nomor login.
    console.log(`PHONE=${phone}`);
    return;
  }

  await prisma.user.create({
    data: { nama, phone, password: hashed, role: "guru", kelas: null },
  });
  console.log(`OK: akun guru dibuat — ${nama} (${phone}).`);
  console.log(`PHONE=${phone}`);
}

main()
  .catch((e) => {
    console.error("GAGAL membuat akun guru:", e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
