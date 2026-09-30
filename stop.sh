#!/bin/bash
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER_CMD="$(command -v docker || command -v podman || true)"

echo "Stopping Phonon Studio services..."
if [ -n "$CONTAINER_CMD" ]; then
  "$CONTAINER_CMD" stop phonon-server 2>/dev/null || true
  "$CONTAINER_CMD" rm phonon-server 2>/dev/null || true
fi

pkill -f "server.py" 2>/dev/null || true
echo "All services stopped."
