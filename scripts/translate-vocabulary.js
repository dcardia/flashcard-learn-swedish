#!/usr/bin/env node
/**
 * Fill missing EN/PT in vocabulary.csv via batched Google Translate.
 * Words are sent newline-delimited in groups (default 20 per request) with
 * a pause between requests to avoid rate limits.
 *
 * Optional: set GOOGLE_TRANSLATE_API_KEY for the official Cloud Translation API.
 * Configure batching: TRANSLATE_BATCH_SIZE, TRANSLATE_BATCH_DELAY_MS
 */

const fs = require("fs");
const path = require("path");
const {
  cleanEnglish,
  loadCache,
  saveCache,
} = require("./translation-lib");
const {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELAY_MS,
  getApiKey,
  translateAll,
} = require("./google-translate-lib");
const {
  parseUnifiedCsv,
  writeUnifiedCsv,
} = require("./vocabulary-lib");
const { lookupTranslations } = require("./dictionary-lib");

const VOCABULARY_CSV = path.join(__dirname, "../data/source/vocabulary.csv");

function isFilled(value) {
  return Boolean(value && value !== "—" && value.trim());
}

function syncCacheFromEntry(entry, cache) {
  const lemma = (entry.lemma || "").toLowerCase();
  const en = cleanEnglish(entry.translations?.en || "");
  const pt = (entry.translations?.pt || "").trim();

  if (!lemma) return;

  if (en) cache.svEn[lemma] = en;
  if (pt) cache.svPt[lemma] = pt;
  if (en && pt) cache.enPt[en.toLowerCase()] = pt;
}

function applyDictionaryPass(entries) {
  let fromDict = 0;
  for (const entry of entries) {
    const looked = lookupTranslations(entry.swedish || entry.lemma, {
      en: isFilled(entry.translations.en) ? entry.translations.en : null,
      pt: isFilled(entry.translations.pt) ? entry.translations.pt : null,
    });

    if (!isFilled(entry.translations.en) && looked.en) {
      entry.translations.en = looked.en;
      fromDict++;
    }
    if (!isFilled(entry.translations.pt) && looked.pt) {
      entry.translations.pt = looked.pt;
      fromDict++;
    }
  }
  return fromDict;
}

function collectGaps(entries) {
  const needEn = [];
  const needPt = [];

  for (const entry of entries) {
    if (!isFilled(entry.translations.en)) needEn.push(entry);
    if (!isFilled(entry.translations.pt)) needPt.push(entry);
  }

  return { needEn, needPt };
}

function progressLine(label, done, total, batchSize) {
  process.stdout.write(
    `\r  ${label}: ${done}/${total} (batch size ${batchSize})`
  );
}

async function fillEnglish(entries, needEn, batchSize, delayMs) {
  if (!needEn.length) return 0;

  const texts = needEn.map((e) => e.swedish || e.lemma);
  const translations = await translateAll(texts, {
    source: "sv",
    target: "en",
    batchSize,
    delayMs,
    onProgress: (done, total) =>
      progressLine("SV → EN", done, total, batchSize),
  });

  let filled = 0;
  for (let i = 0; i < needEn.length; i++) {
    const en = cleanEnglish(translations[i] || "");
    if (en) {
      needEn[i].translations.en = en;
      filled++;
    }
  }
  console.log("");
  return filled;
}

async function fillPortuguese(entries, needPt, batchSize, delayMs) {
  if (!needPt.length) return 0;

  const withEn = [];
  const withEnTexts = [];
  const svOnly = [];

  for (const entry of needPt) {
    const en = cleanEnglish(entry.translations.en || "");
    if (en) {
      withEn.push(entry);
      withEnTexts.push(en);
    } else {
      svOnly.push(entry);
    }
  }

  let filled = 0;

  if (withEn.length) {
    const fromEn = await translateAll(withEnTexts, {
      source: "en",
      target: "pt",
      batchSize,
      delayMs,
      onProgress: (done, total) =>
        progressLine("EN → PT", done, total, batchSize),
    });

    for (let i = 0; i < withEn.length; i++) {
      const pt = (fromEn[i] || "").trim();
      if (pt) {
        withEn[i].translations.pt = pt;
        filled++;
      }
    }
    console.log("");
    if (svOnly.length) await new Promise((r) => setTimeout(r, delayMs));
  }

  if (svOnly.length) {
    const texts = svOnly.map((e) => e.swedish || e.lemma);
    const fromSv = await translateAll(texts, {
      source: "sv",
      target: "pt",
      batchSize,
      delayMs,
      onProgress: (done, total) =>
        progressLine("SV → PT", done, total, batchSize),
    });

    for (let i = 0; i < svOnly.length; i++) {
      const pt = (fromSv[i] || "").trim();
      if (pt) {
        svOnly[i].translations.pt = pt;
        filled++;
      }
    }
    console.log("");
  }

  return filled;
}

async function main() {
  if (!fs.existsSync(VOCABULARY_CSV)) {
    console.error(`Missing ${VOCABULARY_CSV}. Run: npm run build:migrate`);
    process.exit(1);
  }

  const batchSize = DEFAULT_BATCH_SIZE;
  const delayMs = DEFAULT_DELAY_MS;
  const apiKey = getApiKey();

  console.log(
    apiKey
      ? `Using Google Cloud Translation API (batch ${batchSize}, ${delayMs}ms between batches)`
      : `Using Google Translate gtx batches (${batchSize} words/request, ${delayMs}ms pause)`
  );

  const entries = parseUnifiedCsv(fs.readFileSync(VOCABULARY_CSV, "utf8"));
  const dictFilled = applyDictionaryPass(entries);
  if (dictFilled) {
    console.log(`Dictionary pass filled ${dictFilled} slot(s) before translate`);
  }

  let { needEn, needPt } = collectGaps(entries);
  console.log(`Vocabulary: ${entries.length} entries`);
  console.log(`  Missing English: ${needEn.length}`);
  console.log(`  Missing Portuguese: ${needPt.length}`);

  if (!needEn.length && !needPt.length) {
    console.log("Nothing to translate.");
    return;
  }

  const cache = loadCache();

  if (needEn.length) {
    const filled = await fillEnglish(entries, needEn, batchSize, delayMs);
    console.log(`  Filled English: ${filled}/${needEn.length}`);
    for (const entry of needEn) syncCacheFromEntry(entry, cache);
    saveCache(cache);
  }

  ({ needPt } = collectGaps(entries));

  if (needPt.length) {
    const filled = await fillPortuguese(entries, needPt, batchSize, delayMs);
    console.log(`  Filled Portuguese: ${filled}/${needPt.length}`);
    for (const entry of entries) {
      if (entry.source === "kelly") syncCacheFromEntry(entry, cache);
    }
    saveCache(cache);
  }

  writeUnifiedCsv(VOCABULARY_CSV, entries);

  const remaining = collectGaps(entries);
  console.log(`Updated ${VOCABULARY_CSV}`);
  console.log(
    `Remaining gaps — EN: ${remaining.needEn.length}, PT: ${remaining.needPt.length}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
