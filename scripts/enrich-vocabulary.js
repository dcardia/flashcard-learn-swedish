#!/usr/bin/env node
/**
 * Fill missing english/portuguese columns in vocabulary.csv from local dictionaries.
 * Run: npm run enrich
 */

const fs = require("fs");
const path = require("path");
const { parseUnifiedCsv, writeUnifiedCsv } = require("./vocabulary-lib");
const { lookupTranslations, dictionariesAvailable } = require("./dictionary-lib");

const VOCABULARY_CSV = path.join(__dirname, "../data/source/vocabulary.csv");

function main() {
  if (!dictionariesAvailable()) {
    console.error(
      "Dictionary files not found. Place sv-en.sqlite3 and sv-pt.sqlite3 in data/dictionaries/"
    );
    process.exit(1);
  }

  if (!fs.existsSync(VOCABULARY_CSV)) {
    console.error(`Missing ${VOCABULARY_CSV}. Run npm run build:migrate first.`);
    process.exit(1);
  }

  const content = fs.readFileSync(VOCABULARY_CSV, "utf8");
  const entries = parseUnifiedCsv(content);

  let enrichedEn = 0;
  let enrichedPt = 0;

  for (const entry of entries) {
    const hadEn = entry.translations.en && entry.translations.en !== "—";
    const hadPt = entry.translations.pt && entry.translations.pt !== "—";

    const looked = lookupTranslations(entry.swedish, {
      en: hadEn ? entry.translations.en : null,
      pt: hadPt ? entry.translations.pt : null,
    });

    if (!hadEn && looked.en) {
      entry.translations.en = looked.en;
      enrichedEn++;
    }
    if (!hadPt && looked.pt) {
      entry.translations.pt = looked.pt;
      enrichedPt++;
    }
  }

  writeUnifiedCsv(VOCABULARY_CSV, entries);
  console.log(`Enriched ${VOCABULARY_CSV}`);
  console.log(`  Added English: ${enrichedEn}`);
  console.log(`  Added Portuguese: ${enrichedPt}`);
}

main();
