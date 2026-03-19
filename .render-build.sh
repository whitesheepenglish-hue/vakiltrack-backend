#!/usr/bin/env bash
set -euo pipefail

npm ci
npx puppeteer browsers install chrome
