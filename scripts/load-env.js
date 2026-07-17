/**
 * Load KEY=VALUE pairs from project .env into process.env.
 * Does not override variables already set in the environment.
 */

const fs = require("fs");
const path = require("path");

function loadEnv(envPath = path.join(__dirname, "..", ".env")) {
  if (!fs.existsSync(envPath)) return false;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }

  return true;
}

module.exports = { loadEnv };
