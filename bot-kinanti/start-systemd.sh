#!/bin/bash
set -e

BOT_DIR="/home/pi/Desktop/bot-kinanti"
CONFIG_FILE="$BOT_DIR/cloudflared/config.yml"
LOG_DIR="$BOT_DIR/logs"

mkdir -p "$LOG_DIR"
cd "$BOT_DIR"

# Kalau Node kamu dari NVM, aktifkan ini:
export NVM_DIR="/home/pi/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
fi

# Jalankan bot
node server.js >> "$LOG_DIR/bot.log" 2>&1 &
BOT_PID=$!

# Jalankan cloudflared
cloudflared tunnel --config "$CONFIG_FILE" run >> "$LOG_DIR/cloudflared.log" 2>&1 &
CF_PID=$!

# Biar systemd bisa stop dengan rapi
trap "kill $BOT_PID $CF_PID" SIGTERM SIGINT

# Tahan proses tetap hidup
wait -n
