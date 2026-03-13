#!/usr/bin/env bash

echo "Installing dependencies..."
npm install

echo "Installing Chromium for Puppeteer..."
npx puppeteer browsers install chrome
