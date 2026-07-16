# Deploy Kinanti (Docker)

Seluruh sistem (web + bot WhatsApp + Supabase minimal: Postgres & Storage) dijalankan
dengan **satu perintah** di VPS:

```bash
cd kinanti-migrate
sudo bash setup.sh
```

atau langsung dengan domain:

```bash
DOMAIN=kinanti.sekolah.sch.id ACME_EMAIL=admin@sekolah.sch.id sudo -E bash setup.sh
```

`setup.sh` akan: memasang Docker (bila perlu) → membuat secret & kunci Supabase →
build image → menyalakan database, storage, web, bot, dan Caddy (HTTPS otomatis) →
menerapkan schema (Prisma) & membuat bucket → lalu menampilkan **IP publik VPS** untuk
pengaturan DNS, port yang perlu dibuka, URL admin, dan cara scan QR WhatsApp.

📄 **Panduan lengkap: [`docs/PANDUAN-DEPLOY.pdf`](docs/PANDUAN-DEPLOY.pdf)**

## Ringkas
| Hal | Nilai |
|-----|-------|
| Akses web | `https://<domain>` |
| Dashboard token AI | `https://<domain>/admin` (login `admin` / lihat `.env`) |
| Port publik | `80`, `443` (Caddy) |
| Scan QR bot | `docker compose logs -f bot` |
| Stop / start | `docker compose down` / `docker compose up -d` |

> File `.env` berisi password & kunci — simpan aman, jangan commit ke Git.
