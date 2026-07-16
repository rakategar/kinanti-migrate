# Kinanti — Deploy Stack (Web + Bot WhatsApp + Supabase Lokal)

Repo ini membungkus **seluruh sistem Kinanti** dalam Docker agar bisa dipasang di
**VPS sekolah** dengan satu perintah:

- **Web** — Next.js (guru & siswa, generate soal HOTS, penilaian otomatis)
- **Bot WhatsApp** — `whatsapp-web.js` + Chromium
- **Supabase lokal (minimal)** — Postgres + Storage API + PostgREST
- **Caddy** — reverse proxy + HTTPS otomatis (Let's Encrypt)
- **Dashboard AI Token Switcher** — `/admin`, rotasi otomatis saat token Gemini kena limit

📄 Panduan bergambar: [`docs/PANDUAN-DEPLOY.pdf`](docs/PANDUAN-DEPLOY.pdf)

---

## 1. Kebutuhan Minimal Sistem

### Perangkat keras (VPS)

| Komponen | Minimum | Direkomendasikan | Catatan |
|---|---|---|---|
| **CPU** | 2 vCPU | 4 vCPU | Chromium (bot WA) + build Next.js paling haus CPU |
| **RAM** | **4 GB** | **8 GB** | <4 GB berisiko OOM saat `next build` & saat Chromium jalan |
| **Disk** | **20 GB** | **40 GB** | Lihat rincian di bawah |
| **Swap** | 2 GB | 2 GB | Wajib jika RAM hanya 4 GB |

> ⚠️ **Disk adalah kebutuhan yang paling sering diremehkan.** Rincian pemakaian:
>
> | Item | Ukuran |
> |---|---|
> | Image `supabase/postgres` | ~3 GB |
> | Image `supabase/storage-api` + `postgrest` | ~0,5 GB |
> | Image `caddy` | ~0,05 GB |
> | Image **web** (build + runtime) | ~1,5 GB |
> | Image **bot** (termasuk Chromium) | ~1,5 GB |
> | Build cache Docker | ~2 GB |
> | Data (DB + file PDF + sesi WA) | tumbuh seiring pemakaian |
> | **Total awal** | **≈ 9–10 GB** |
>
> Sediakan **20 GB** agar ada ruang untuk data, backup, dan update.

### Perangkat lunak

- **OS**: Ubuntu 22.04 / 24.04 LTS atau Debian 12 (64-bit). Arsitektur **x86_64**
  (ARM belum diuji — image `supabase/postgres` bisa berbeda).
- **Docker Engine** + plugin `docker compose` v2 — *dipasang otomatis oleh `setup.sh`
  jika belum ada*.
- **Akses root/sudo**.
- Utilitas: `curl`, `openssl` (umumnya sudah ada).

### Jaringan

| Port | Arah | Wajib dibuka? | Fungsi |
|---|---|---|---|
| **80/tcp** | masuk | ✅ Ya | HTTP + verifikasi sertifikat Let's Encrypt |
| **443/tcp** | masuk | ✅ Ya | HTTPS (semua akses aplikasi) |
| 3000 / 4000 / 5432 / 5000 | internal | ❌ Tidak | Web, bot, DB, storage — hanya di jaringan Docker |
| keluar (443) | keluar | ✅ Ya | Ambil image Docker, API Gemini, WhatsApp Web |

### Prasyarat lain

- **Domain** yang bisa Anda atur DNS-nya (mis. `kinanti.sekolah.sch.id`).
  Diperlukan untuk HTTPS **dan** untuk link unduh PDF di Storage.
- **Nomor WhatsApp** khusus untuk bot (akan di-scan QR sekali).
- **API key Google Gemini** (minimal 1; bisa ditambah lewat `/admin` agar rotasi jalan).

---

## 2. Cara Setup (VPS)

### Langkah 1 — Ambil kode

```bash
git clone https://github.com/rakategar/kinanti-migrate.git
cd kinanti-migrate
```

### Langkah 2 — Jalankan super setup

```bash
sudo bash setup.sh
```

Skrip akan menanyakan **domain** dan **email admin**. Bisa juga langsung:

```bash
DOMAIN=kinanti.sekolah.sch.id ACME_EMAIL=admin@sekolah.sch.id sudo -E bash setup.sh
```

`setup.sh` bersifat **idempotent** (aman diulang) dan melakukan:

1. Memasang Docker bila belum ada
2. Membuat `.env` + **generate semua secret** (password DB, `JWT_SECRET`,
   `NEXTAUTH_SECRET`, `BOT_SECRET`) dan **mint kunci Supabase** (`anon`, `service_role`)
3. Build image web & bot
4. Menyalakan Postgres + Storage, menunggu sampai sehat
5. Menerapkan schema aplikasi (`prisma db push`) — termasuk tabel `AiToken`
6. Membuat bucket `assignments` & `submissions`
7. Menyalakan web, bot, dan Caddy
8. **Mencetak IP publik VPS, target DNS, port, URL admin, dan cara scan QR**

### Langkah 3 — Arahkan DNS

Di akhir, skrip menampilkan IP publik VPS. Buat **A record** di panel domain:

| Type | Name | Value |
|---|---|---|
| A | `kinanti` (atau sesuai domain) | `<IP publik dari output setup.sh>` |

Tunggu DNS propagasi (biasanya beberapa menit), lalu Caddy menerbitkan HTTPS otomatis.

### Langkah 4 — Scan QR WhatsApp (sekali saja)

```bash
docker compose logs -f bot
```

Scan QR dengan WhatsApp bot. Sesi tersimpan di volume `wa_auth`, jadi **tidak perlu
scan ulang** saat restart.

### Langkah 5 — Isi token AI

Buka `https://<domain>/admin` → login (`admin` / password ada di `.env`) →
tambahkan **beberapa** API key Gemini.

**Cara kerja rotasi:** key dipakai urut `priority`. Saat sebuah key kena limit (HTTP 429 /
quota exhausted), key itu ditandai `limited` + diberi cooldown (default 15 menit) dan
sistem **otomatis lanjut ke key berikutnya** tanpa mengganggu proses. Error `503`
(model sibuk) **bukan** masalah kuota — itu ditangani dengan fallback antar-model, bukan
ganti key. Kalau tabel token kosong, sistem jatuh ke `GEMINI_API_KEY` di `.env`.

---

## 3. Operasional

```bash
docker compose ps                  # status semua service
docker compose logs -f web         # log (web|bot|caddy|storage|db)
docker compose down                # stop (data tetap aman di volume)
docker compose up -d               # start lagi
git pull && docker compose build && docker compose up -d   # update
```

### Backup

```bash
# Database
docker compose exec -T db pg_dump -U postgres postgres > backup-$(date +%F).sql

# File (PDF tugas & jawaban)
docker run --rm -v kinanti_storage_data:/data -v "$PWD":/b alpine \
  tar czf /b/storage-$(date +%F).tgz -C /data .
```

### Restore

```bash
cat backup-2026-07-16.sql | docker compose exec -T db psql -U postgres -d postgres
```

---

## 4. Troubleshooting

| Gejala | Kemungkinan sebab | Tindakan |
|---|---|---|
| HTTPS gagal / sertifikat tidak terbit | DNS belum mengarah, atau port 80 tertutup | Cek A record & firewall; `docker compose logs caddy` |
| Bot tidak jalan / QR muncul terus | Sesi WA rusak | `docker compose restart bot`; jika perlu hapus volume `wa_auth` lalu scan ulang |
| Link PDF 404 | Bucket belum dibuat | Jalankan ulang `sudo bash setup.sh` (idempotent) |
| Web error koneksi DB | DB belum sehat | `docker compose ps`; `docker compose logs db` |
| Soal HOTS gagal terus | Semua token limit | Cek `/admin` — tambah key baru atau tunggu cooldown |
| Build gagal / OOM | RAM/disk kurang | Pastikan ≥4 GB RAM + swap, dan ≥20 GB disk kosong |

---

## 5. Struktur Repo

```
kinanti-migrate/
├── docker-compose.yml        # 6 service: db, rest, storage, web, bot, caddy
├── setup.sh                  # super setup — satu perintah untuk semua
├── .env.docker.example       # template env (setup.sh menyalinnya jadi .env)
├── caddy/Caddyfile           # routing + HTTPS otomatis
├── supabase-local/
│   ├── gen-jwt.js            # mint kunci anon & service_role dari JWT_SECRET
│   └── db-init/              # role & JWT setting untuk Postgres
├── kinanti/                  # aplikasi web (Next.js) + Dockerfile
├── bot-kinanti/              # bot WhatsApp + Dockerfile
└── docs/PANDUAN-DEPLOY.pdf   # panduan lengkap bergambar
```

---

## 6. Catatan Keamanan

- **`.env` tidak pernah di-commit** (sudah masuk `.gitignore`). File ini berisi password
  database, kunci `service_role`, dan password admin — simpan aman & backup terpisah.
- Semua secret **di-generate acak oleh `setup.sh`** — tidak ada nilai default yang dibawa
  repo ini.
- Port database & storage hanya di-bind ke `127.0.0.1` — tidak terekspos ke internet.
- Ganti `ADMIN_PASSWORD` di `.env` lalu `docker compose up -d web` untuk menerapkan.

---

## 7. Status Pengujian (jujur)

| Bagian | Status |
|---|---|
| `docker compose config` | ✅ Valid |
| `Dockerfile` web & bot (`docker build --check`) | ✅ Lolos tanpa warning |
| Build Next.js standalone + Prisma engine ter-bundle | ✅ Terverifikasi lokal |
| `gen-jwt.js` (JWT HS256 anon/service_role) | ✅ Terverifikasi |
| Sintaks `setup.sh` | ✅ Valid |
| Rotasi token AI (unit test dgn mock Prisma) | ✅ Terverifikasi |
| **`docker compose up` end-to-end** | ⚠️ **Belum diuji** — mesin pengembangan kehabisan disk (sisa 1,7 GB dari kebutuhan ~10 GB) |

Artinya: **jalankan `setup.sh` pertama kali di VPS dengan disk memadai**, dan perhatikan
output `docker compose logs` pada percobaan pertama. Kalau ada langkah yang gagal, skrip
aman untuk dijalankan ulang.
