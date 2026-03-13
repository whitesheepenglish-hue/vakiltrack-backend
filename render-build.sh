#!/usr/bin/env bash

# Install dependencies
npm install

# Install Playwright Chromium (browsers cached in Render persistent directory when available)
export PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright
mkdir -p "$PLAYWRIGHT_BROWSERS_PATH"
npx playwright install chromium
