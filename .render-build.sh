#!/usr/bin/env bash
set -euo pipefail

# Render build hook.
# Installs dependencies for the Node backend (supports monorepo layout).

if [[ -f "vakiltrack-backend/package.json" ]]; then
  cd vakiltrack-backend
fi

if [[ -f "package-lock.json" ]]; then
  npm ci
else
  npm install
fi

