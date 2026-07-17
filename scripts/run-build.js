#!/usr/bin/env node
/**
 * Orchestrates vocabulary migration + JS bundle generation.
 * Pass --translate=google to run Google Translate gap-fill before migrate.
 */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const args = process.argv.slice(2);
const useTranslate = args.includes("--translate=google") || args.includes("--translate=llm");

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (useTranslate) {
  run("node", ["scripts/translate-vocabulary.js"]);
}

const migrateArgs = ["scripts/migrate-vocabulary.js"];
if (args.includes("--report")) migrateArgs.push("--report");

run("node", migrateArgs);
run("node", ["scripts/build-vocabulary.js"]);
