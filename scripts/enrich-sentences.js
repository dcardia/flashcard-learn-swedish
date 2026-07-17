#!/usr/bin/env node
/**
 * Generate example sentences for Kelly vocabulary via Gemini API.
 * Processes top 3000 words by frequency (from sorted Kelly CSV).
 *
 * Usage:
 *   cp .env.example .env   # set GEMINI_API_KEY
 *   npm run enrich:sentences
 *   npm run enrich:sentences -- --limit 10
 *   npm run enrich:sentences -- --apply-cache
 *
 * Progress: data/sentence-enrichment-cache.json + vocabulary.csv (after each word)
 */

require("./load-env").loadEnv();

const fs = require("fs");
const path = require("path");
const { KELLY_FILE } = require("./translation-lib");
const { sleep } = require("./translation-lib");
const {
  buildSentencePrompt,
  generateJsonWithRetry,
  DEFAULT_DELAY_MS,
  getApiKey,
} = require("./gemini-lib");
const {
  parseUnifiedCsv,
  writeUnifiedCsv,
  buildTokens,
  deriveEntryForms,
  mergeCachedExampleTokens,
  TENSE_LABELS,
} = require("./vocabulary-lib");

const ROOT = path.join(__dirname, "..");
const VOCABULARY_CSV = path.join(ROOT, "data/source/vocabulary.csv");
const CACHE_FILE = path.join(ROOT, "data/sentence-enrichment-cache.json");
const KELLY_CSV = path.join(ROOT, "data/source", KELLY_FILE);

const TOP_N = Number(process.env.ENRICH_TOP_N) || 3000;
const VALID_TENSES = new Set(["past", "present", "future"]);

function parseArgs() {
  const args = process.argv.slice(2);
  let limit = Infinity;
  let applyCacheOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) {
      limit = Number(args[++i]) || limit;
    } else if (args[i] === "--apply-cache") {
      applyCacheOnly = true;
    }
  }

  return { limit, applyCacheOnly };
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function cleanSwedish(raw) {
  return raw
    .trim()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

/**
 * Build lemma -> frequency rank (0 = highest) from Kelly CSV, top N unique lemmas.
 */
function loadKellyFrequencyRank(kellyPath, topN = TOP_N) {
  if (!fs.existsSync(kellyPath)) {
    throw new Error(`Kelly CSV not found: ${kellyPath}`);
  }

  const rows = parseCsv(fs.readFileSync(kellyPath, "utf8")).slice(5);
  const rank = new Map();
  let count = 0;

  for (const row of rows) {
    if (count >= topN) break;
    const swedish = cleanSwedish(row[6] || "");
    if (!swedish) continue;
    const lemma = swedish.toLowerCase().split(/\s+/)[0];
    if (rank.has(lemma)) continue;
    rank.set(lemma, count);
    count++;
  }

  return rank;
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

function hasExamples(entry) {
  return Boolean(entry.examples?.length);
}

function validateGeminiExamples(examples, isVerb) {
  if (!Array.isArray(examples) || examples.length !== 3) {
    throw new Error(`Expected 3 examples, got ${examples?.length ?? 0}`);
  }

  const normalized = examples.map((ex) => ({
    tense: ex.tense && ex.tense !== "null" ? String(ex.tense).toLowerCase() : null,
    sv: (ex.sv || "").trim(),
    en: (ex.en || "").trim(),
    pt: (ex.pt || "").trim(),
    tokens: Array.isArray(ex.tokens) ? ex.tokens : null,
  }));

  for (const ex of normalized) {
    if (!ex.sv || !ex.en || !ex.pt) {
      throw new Error("Each example must have sv, en, and pt");
    }
  }

  if (isVerb) {
    const tenses = normalized.map((ex) => ex.tense);
    for (const t of ["past", "present", "future"]) {
      if (!tenses.includes(t)) {
        throw new Error(`Verb missing "${t}" tense example`);
      }
    }
    for (const ex of normalized) {
      if (ex.tense && !VALID_TENSES.has(ex.tense)) {
        throw new Error(`Invalid tense: ${ex.tense}`);
      }
    }
  }

  return normalized;
}

function applyExamplesToEntry(entry, geminiExamples) {
  const lemma = entry.swedish || entry.lemma;
  const translations = entry.translations || { en: "—", pt: "—" };
  const formsSeed = entry.forms?.length ? entry.forms : [lemma.toLowerCase()];
  const isVerb = entry.type === "verb";
  const validated = validateGeminiExamples(geminiExamples, isVerb);

  entry.examples = validated.map((ex, i) => {
    const tokens = buildTokens(ex.sv, [], lemma, translations, formsSeed);
    if (ex.tokens?.length) {
      mergeCachedExampleTokens({ tokens }, ex.tokens);
    }
    const example = {
      id: `${entry.id}-ex${i + 1}`,
      swedish: ex.sv,
      translations: { en: ex.en, pt: ex.pt },
      tokens,
    };

    if (ex.tense && VALID_TENSES.has(ex.tense)) {
      example.tense = ex.tense;
      example.tenseLabel = TENSE_LABELS[ex.tense] || {
        en: ex.tense,
        pt: ex.tense,
      };
    }

    return example;
  });

  entry.forms = deriveEntryForms(entry);
  return entry;
}

function applyCacheToEntries(entries, cache) {
  let applied = 0;
  for (const entry of entries) {
    const cached = cache.completed[entry.id];
    if (!cached?.examples?.length) continue;
    if (hasExamples(entry)) continue;
    applyExamplesToEntry(entry, cached.examples);
    applied++;
  }
  return applied;
}

function selectCandidates(entries, frequencyRank, cache) {
  return entries
    .filter((entry) => {
      if (hasExamples(entry)) return false;
      if (cache.completed[entry.id]?.examples?.length) return false;
      const rank = frequencyRank.get(entry.lemma);
      if (rank === undefined) return false;
      entry._freqRank = rank;
      return true;
    })
    .sort((a, b) => a._freqRank - b._freqRank);
}

async function enrichOne(entry, cache) {
  const prompt = buildSentencePrompt(entry);
  const result = await generateJsonWithRetry(prompt);
  const examples = result.examples || result.items || result.sentences;

  applyExamplesToEntry(entry, examples);

  cache.completed[entry.id] = {
    lemma: entry.lemma,
    swedish: entry.swedish,
    generatedAt: new Date().toISOString(),
    examples: entry.examples.map((ex) => ({
      tense: ex.tense || null,
      sv: ex.swedish,
      en: ex.translations.en,
      pt: ex.translations.pt,
      tokens: ex.tokens.map((t) => ({
        sv: t.swedish,
        en: t.translations.en,
        pt: t.translations.pt,
      })),
    })),
  };

  saveCache(cache);
}

async function main() {
  const { limit, applyCacheOnly } = parseArgs();

  if (!fs.existsSync(VOCABULARY_CSV)) {
    console.error(`Missing ${VOCABULARY_CSV}. Run: npm run build:migrate`);
    process.exit(1);
  }

  const frequencyRank = loadKellyFrequencyRank(KELLY_CSV, TOP_N);
  console.log(
    `Kelly frequency rank: ${frequencyRank.size} lemmas (top ${TOP_N})`
  );

  const entries = parseUnifiedCsv(fs.readFileSync(VOCABULARY_CSV, "utf8"));
  const cache = loadCache();

  const fromCache = applyCacheToEntries(entries, cache);
  if (fromCache) {
    writeUnifiedCsv(VOCABULARY_CSV, entries);
    console.log(`Applied ${fromCache} cached sentence set(s) to vocabulary.csv`);
  }

  const candidates = selectCandidates(entries, frequencyRank, cache);
  const cachedCount = Object.keys(cache.completed).length;

  console.log(`Vocabulary: ${entries.length} entries`);
  console.log(`  Cached sentences: ${cachedCount}`);
  console.log(`  Candidates (top ${TOP_N}, no examples): ${candidates.length}`);

  if (applyCacheOnly) {
    console.log("--apply-cache: skipping API calls");
    return;
  }

  if (!candidates.length) {
    console.log("Nothing to enrich.");
    return;
  }

  if (!getApiKey()) {
    console.error(
      "Set GEMINI_API_KEY in your environment (e.g. in a .env file, not committed to git)."
    );
    process.exit(1);
  }

  const batch = candidates.slice(0, limit);
  console.log(`Processing ${batch.length} word(s)...`);

  let done = 0;
  for (const entry of batch) {
    const rank = entry._freqRank + 1;
    process.stdout.write(
      `\r  [${done + 1}/${batch.length}] #${rank} ${entry.swedish} (${entry.type})...`
    );

    try {
      await enrichOne(entry, cache);
      writeUnifiedCsv(VOCABULARY_CSV, entries);
      done++;
      if (done < batch.length) await sleep(DEFAULT_DELAY_MS);
    } catch (err) {
      console.error(`\n  Failed on ${entry.swedish}: ${err.message}`);
      if (err.name === "QuotaError") {
        if (err.exhausted) {
          console.error(
            "  Gemini free-tier quota is exhausted (limit: 0). Enable billing or wait for quota reset, then re-run."
          );
        } else {
          console.error(
            "  Rate limited. Progress saved — re-run later to continue."
          );
        }
      }
      break;
    }
  }

  console.log(`\nDone. Enriched ${done} word(s). Cache: ${CACHE_FILE}`);

  if (fromCache || done > 0) {
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
