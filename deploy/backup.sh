#!/usr/bin/env bash
# Back up Opus's data and its master key into two SEPARATE files.
# Keep them in different places: whoever has both can read your data.
# Usage (from the repo folder on the server):  deploy/backup.sh [output-folder]
set -euo pipefail

out="${1:-./backups}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# Stop Opus while copying so the database is not captured mid-write. Always start it again.
docker compose stop opus
trap 'docker compose start opus' EXIT

# Volume names come from `name: opus` in docker-compose.yml.
docker run --rm -v opus_data:/v:ro -v "$out":/out alpine tar czf "/out/opus-data-$stamp.tgz" -C /v .
docker run --rm -v opus_keys:/v:ro -v "$out":/out alpine tar czf "/out/opus-key-$stamp.tgz" -C /v .
chmod 600 "$out/opus-key-$stamp.tgz"

echo "Wrote:"
echo "  $out/opus-data-$stamp.tgz   (database, files, Opus's own daily backups)"
echo "  $out/opus-key-$stamp.tgz    (master key: store it somewhere else)"
