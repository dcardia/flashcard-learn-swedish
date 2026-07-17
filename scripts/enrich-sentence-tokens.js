#!/usr/bin/env node
/**
 * Backfill contextual word-by-word glosses for enriched example sentences.
 * Reads/writes data/sentence-enrichment-cache.json, then rebuilds vocabulary-data.js.
 *
 * Usage:
 *   npm run enrich:sentence-tokens
 *   npm run enrich:sentence-tokens -- --limit 20
 *   npm run enrich:sentence-tokens -- --id kelly-873-racka
 */

require("./load-env").loadEnv();

const fs = require("fs");
const path = require("path");
const { sleep } = require("./translation-lib");
const {
  buildTokenAlignmentPrompt,
  generateJsonWithRetry,
  DEFAULT_DELAY_MS,
  getApiKey,
} = require("./gemini-lib");
const {
  parseUnifiedCsv,
} = require("./vocabulary-lib");

const ROOT = path.join(__dirname, "..");
const CACHE_FILE = path.join(ROOT, "data/sentence-enrichment-cache.json");
const VOCABULARY_CSV = path.join(ROOT, "data/source/vocabulary.csv");

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let entryId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number(args[++i]) || limit;
    } else if (args[i] === "--id" && args[i + 1]) {
      entryId = args[++i];
    }
  }

  return { limit, entryId };
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      return {
        version: raw.version || 1,
        completed: raw.completed || {},
      };
    }
  } catch {
    /* ignore */
  }
  return { version: 1, completed: {} };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function exampleNeedsTokens(ex) {
  return !ex.tokens?.length;
}

function entryNeedsTokenAlignment(cached) {
  return cached.examples?.some(exampleNeedsTokens);
}

function validateAlignment(sv, alignedExamples) {
  const match = alignedExamples.find((ex) => ex.sv === sv);
  if (!match?.tokens?.length) {
    throw new Error(`Missing token alignment for sentence: ${sv}`);
  }
  return match.tokens;
}

async function alignEntryTokens(entryId, cached, entryMeta) {
  const pending = cached.examples.filter(exampleNeedsTokens);
  if (!pending.length) return 0;

  const prompt = buildTokenAlignmentPrompt(
    {
      swedish: cached.swedish || entryMeta?.swedish,
      lemma: cached.lemma || entryMeta?.lemma,
      type: entryMeta?.type || "other",
    },
    pending
  );

  const result = await generateJsonWithRetry(prompt);
  const aligned = result.examples || [];

  let updated = 0;
  for (const ex of cached.examples) {
    if (!exampleNeedsTokens(ex)) continue;
    ex.tokens = validateAlignment(ex.sv, aligned);
    updated++;
  }

  cached.tokensAlignedAt = new Date().toISOString();
  return updated;
}

async function main() {
  const { limit, entryId } = parseArgs();

  if (!getApiKey()) {
    console.error("Set GEMINI_API_KEY in .env");
    process.exit(1);
  }

  const cache = loadCache();
  const entries = fs.existsSync(VOCABULARY_CSV)
    ? parseUnifiedCsv(fs.readFileSync(VOCABULARY_CSV, "utf8"))
    : [];
  const entryById = new Map(entries.map((e) => [e.id, e]));

  let candidates = Object.entries(cache.completed).filter(([, cached]) =>
    entryNeedsTokenAlignment(cached)
  );

  if (entryId) {
    candidates = candidates.filter(([id]) => id === entryId);
    if (!candidates.length) {
      console.error(`No pending token alignment for ${entryId}`);
      process.exit(1);
    }
  }

  candidates = candidates.slice(0, limit);
  console.log(`Token alignment candidates: ${candidates.length}`);

  let done = 0;
  let tokenExamples = 0;

  for (const [id, cached] of candidates) {
    process.stdout.write(
      `\r  [${done + 1}/${candidates.length}] ${cached.swedish || id}...`
    );

    try {
      const updated = await alignEntryTokens(id, cached, entryById.get(id));
      saveCache(cache);
      tokenExamples += updated;
      done++;
      if (done < candidates.length) await sleep(DEFAULT_DELAY_MS);
    } catch (err) {
      console.error(`\n  Failed on ${id}: ${err.message}`);
      break;
    }
  }

  console.log(`\nDone. Aligned tokens for ${tokenExamples} example(s).`);

  if (done > 0) {
    const { spawnSync } = require("child_process");
    console.log("Rebuilding js/vocabulary-data.js...");
    const result = spawnSync("node", ["scripts/build-vocabulary.js"], {
      cwd: ROOT,
      stdio: "inherit",
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
