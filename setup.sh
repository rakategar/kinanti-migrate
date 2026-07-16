#!/usr/bin/env bash
# =====================================================================
# Kinanti — SUPER SETUP (satu perintah untuk semua)
# Menyiapkan: Docker, Postgres+Storage (Supabase minimal), web, bot WhatsApp,
# Caddy (HTTPS). Idempotent: aman dijalankan ulang.
#
#   sudo bash setup.sh
#
# Opsi via env/flag:
#   DOMAIN=kinanti.sekolah.sch.id ACME_EMAIL=admin@sekolah.sch.id sudo -E bash setup.sh
# =====================================================================
set -euo pipefail

# ---------- warna & util ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${BLUE}[i]${NC} $*"; }
ok()    { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[x]${NC} $*" >&2; }
die()   { err "$*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.docker.example"

# compose helper (plugin `docker compose` vs legacy `docker-compose`)
dc() { docker compose "$@"; }

# ---------- 0. root ----------
if [ "$(id -u)" -ne 0 ]; then
  die "Jalankan sebagai root: sudo bash setup.sh"
fi

# ---------- 1. Docker ----------
info "Memeriksa Docker..."
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker belum ada — menginstal via get.docker.com ..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker || true
  ok "Docker terinstal."
else
  ok "Docker sudah ada ($(docker --version | awk '{print $3}' | tr -d ','))."
fi
if ! docker compose version >/dev/null 2>&1; then
  die "Plugin 'docker compose' tidak ditemukan. Install docker-compose-plugin lalu ulangi."
fi
systemctl start docker 2>/dev/null || true

# ---------- 2. Siapkan .env ----------
if [ ! -f "$ENV_FILE" ]; then
  info "Membuat .env dari .env.docker.example ..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

# get_env KEY -> nilai; set_env KEY VALUE (aman untuk value dgn / dan &)
get_env() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- || true; }
set_env() {
  local key="$1"; shift; local val="$*"
  if grep -qE "^$key=" "$ENV_FILE"; then
    # gunakan pemisah | dan escape | & \ pada value
    local esc; esc=$(printf '%s' "$val" | sed -e 's/[\\|&]/\\&/g')
    sed -i "s|^$key=.*|$key=$esc|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}
need_gen() { local v; v=$(get_env "$1"); [ -z "$v" ] || [ "$v" = "<GENERATE>" ]; }
rand()    { openssl rand -base64 "${1:-32}" | tr -d '\n/+=' | cut -c1-"${2:-40}"; }

# --- Domain & email: dari env, atau prompt ---
DOMAIN="${DOMAIN:-$(get_env DOMAIN)}"
ACME_EMAIL="${ACME_EMAIL:-$(get_env ACME_EMAIL)}"
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "kinanti.sekolah.sch.id" ]; then
  read -rp "Masukkan domain (mis. kinanti.sekolah.sch.id, atau 'localhost' utk uji): " DOMAIN
fi
if [ -z "$ACME_EMAIL" ] || [ "$ACME_EMAIL" = "admin@sekolah.sch.id" ]; then
  read -rp "Masukkan email admin (untuk sertifikat Let's Encrypt): " ACME_EMAIL
fi
set_env DOMAIN "$DOMAIN"
set_env ACME_EMAIL "$ACME_EMAIL"

# Skema URL: localhost tanpa TLS publik → tetap https via Caddy internal CA,
# tapi app diakses lewat http://localhost:3000 saat uji. Untuk domain → https.
if [ "$DOMAIN" = "localhost" ]; then
  PUBURL="http://localhost:3000"
else
  PUBURL="https://$DOMAIN"
fi
set_env SUPABASE_URL "$PUBURL"
set_env NEXTAUTH_URL "$PUBURL"

# --- Secrets ---
info "Menyiapkan secret..."
need_gen POSTGRES_PASSWORD && set_env POSTGRES_PASSWORD "$(rand 32 40)"
need_gen JWT_SECRET        && set_env JWT_SECRET "$(rand 48 48)"
need_gen NEXTAUTH_SECRET   && set_env NEXTAUTH_SECRET "$(openssl rand -base64 32)"
need_gen BOT_SECRET        && set_env BOT_SECRET "$(rand 24 30)"

# --- Mint JWT anon & service_role dari JWT_SECRET ---
if need_gen ANON_KEY || need_gen SERVICE_ROLE_KEY; then
  info "Membuat kunci Supabase (anon & service_role) ..."
  JWT_SECRET_VAL="$(get_env JWT_SECRET)"
  KEYS_OUT="$(docker run --rm -e JWT_SECRET="$JWT_SECRET_VAL" \
      -v "$SCRIPT_DIR/supabase-local:/s:ro" node:20-slim \
      node /s/gen-jwt.js)"
  ANON_VAL="$(printf '%s\n' "$KEYS_OUT" | grep '^ANON_KEY=' | cut -d= -f2-)"
  SVC_VAL="$(printf '%s\n' "$KEYS_OUT" | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)"
  [ -n "$ANON_VAL" ] && [ -n "$SVC_VAL" ] || die "Gagal membuat kunci JWT."
  set_env ANON_KEY "$ANON_VAL"
  set_env SERVICE_ROLE_KEY "$SVC_VAL"
fi
ok "Konfigurasi .env siap."

# ---------- 3. Build & jalankan database + storage ----------
info "Build image (web & bot) — bisa beberapa menit pertama kali..."
dc build

info "Menjalankan database & storage..."
dc up -d db rest storage

info "Menunggu database siap..."
for i in $(seq 1 60); do
  if dc exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; then ok "Database siap."; break; fi
  sleep 2; [ "$i" = 60 ] && die "Database tidak siap."
done

info "Menunggu storage siap (migrasi schema storage)..."
for i in $(seq 1 60); do
  if dc exec -T storage wget -q --spider http://localhost:5000/status >/dev/null 2>&1; then ok "Storage siap."; break; fi
  sleep 2; [ "$i" = 60 ] && warn "Storage belum sehat — cek: docker compose logs storage"
done

# ---------- 4. Migrasi schema aplikasi (Prisma) ----------
info "Menerapkan schema database aplikasi (prisma db push)..."
dc run --rm web prisma db push --skip-generate

# ---------- 5. Buat bucket storage (assignments, submissions) ----------
info "Membuat bucket storage (assignments, submissions)..."
dc exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL' || warn "Seed bucket gagal — cek schema storage."
insert into storage.buckets (id, name, public)
values ('assignments','assignments',true), ('submissions','submissions',true)
on conflict (id) do update set public = excluded.public;
SQL

# ---------- 6. Jalankan web, bot, caddy ----------
info "Menjalankan web, bot, dan reverse proxy..."
dc up -d web bot caddy

# ---------- 7. Banner handoff ----------
PUBLIC_IP="$(curl -s --max-time 8 https://api.ipify.org || curl -s --max-time 8 https://ifconfig.me || hostname -I | awk '{print $1}')"
ADMIN_USER="$(get_env ADMIN_USERNAME)"; ADMIN_PASS="$(get_env ADMIN_PASSWORD)"

echo ""
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo -e "${GREEN}${BOLD}   ✅ KINANTI SIAP DIJALANKAN${NC}"
echo -e "${GREEN}${BOLD}============================================================${NC}"
echo ""
echo -e "${BOLD}1) DNS — arahkan domain ke VPS ini:${NC}"
echo -e "   Tambahkan A record:  ${YELLOW}${DOMAIN}  →  ${PUBLIC_IP}${NC}"
echo -e "   (Caddy otomatis menerbitkan HTTPS Let's Encrypt setelah DNS aktif.)"
echo ""
echo -e "${BOLD}2) Port yang harus terbuka di firewall VPS:${NC}"
echo -e "   ${YELLOW}80/tcp${NC} dan ${YELLOW}443/tcp${NC}  (HTTP/HTTPS lewat Caddy)"
echo -e "   Internal (tidak perlu dibuka): web:3000, bot:4000, db:5432, storage:5000"
echo ""
echo -e "${BOLD}3) Akses aplikasi:${NC}"
echo -e "   Web:            ${BLUE}${PUBURL}${NC}"
echo -e "   Dashboard AI:   ${BLUE}${PUBURL%/}/admin${NC}   (login: ${ADMIN_USER} / ${ADMIN_PASS})"
echo ""
echo -e "${BOLD}4) Bot WhatsApp — scan QR (sekali saja):${NC}"
echo -e "   ${YELLOW}docker compose logs -f bot${NC}   lalu scan QR dengan WhatsApp."
echo -e "   Sesi tersimpan di volume 'wa_auth' (tak perlu scan ulang saat restart)."
echo ""
echo -e "${BOLD}Perintah berguna:${NC}"
echo -e "   Status:  ${BLUE}docker compose ps${NC}"
echo -e "   Log:     ${BLUE}docker compose logs -f web|bot|caddy|storage${NC}"
echo -e "   Stop:    ${BLUE}docker compose down${NC}   (data aman di volume)"
echo -e "   Update:  ${BLUE}git pull && docker compose build && docker compose up -d${NC}"
echo ""
