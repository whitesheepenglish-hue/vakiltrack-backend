const fs = require("node:fs");
const path = require("node:path");

let envLoaded = false;

function loadEnv() {
  if (envLoaded) {
    return;
  }

  let dotenv;
  try {
    dotenv = require("dotenv");
  } catch {
    envLoaded = true;
    return;
  }

  const envCandidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, "..", ".env"),
    path.join(process.cwd(), "..", ".env"),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, quiet: true });
    }
  }

  envLoaded = true;
}

loadEnv();

module.exports = loadEnv;
