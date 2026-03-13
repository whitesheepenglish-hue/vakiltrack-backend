#!/usr/bin/env bash

# Install dependencies
npm install

# Install Puppeteer Chrome
npx puppeteer browsers install chrome

# Create cache directory
mkdir -p /opt/render/.cache/puppeteer
