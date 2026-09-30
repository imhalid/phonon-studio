#!/bin/bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_CMD="$(command -v docker || command -v podman || true)"

if [ -z "$CONTAINER_CMD" ]; then
  echo "Error: Neither docker nor podman was found on the system."
  exit 1
fi

mkdir -p "$HOME/.cache/phonon"
echo "[1/2] Checking Phonon backend container..."

if ! "$CONTAINER_CMD" ps --format '{{.Names}}' | grep -q "^phonon-server$"; then
  echo "Starting Phonon-2 CUDA GPU server on port 8000..."
  "$CONTAINER_CMD" run -d --name phonon-server --replace \
    --user 0 \
    --security-opt label=disable \
    --device nvidia.com/gpu=all \
    -v "$HOME/.cache/phonon:/root/.cache/phonon:Z" \
    -p 8000:8000 \
    ghcr.io/fermionresearch/phonon-cuda:1.0.3 \
    serve --host 0.0.0.0 --port 8000 --api-key phonon-local --model phonon-2
fi

echo "[2/2] Launching Phonon Studio Web Interface..."
echo "Studio UI URL: http://localhost:3000"
exec python3 "$HERE/server.py"
