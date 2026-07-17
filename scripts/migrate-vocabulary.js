#!/usr/bin/env node
/**
 * One-time migration: merge legacy CSV sources into data/source/vocabulary.csv
 * Run: npm run build:migrate
 */

const fs = require("fs");
const path = require("path");
const { loadKellyEntries } = require("./kelly-vocabulary");
const {
  VOCABULARY_COLUMNS,
  loadLegacyPracticeEntries,
  writeUnifiedCsv,
} = require("./vocabulary-lib");

const SOURCE_DIR = path.join(__dirname, "../data/source");
const OUTPUT = path.join(SOURCE_DIR, "vocabulary.csv");

async function main() {
  console.log("Migrating legacy vocabulary sources...");

  const { adjectives, adverbs, verbs, practiceEntries } =
    loadLegacyPracticeEntries(SOURCE_DIR);

  const existingLemmas = new Set(
    practiceEntries.map((e) => e.lemma.toLowerCase())
  );

  const { entries: kellyEntries, stats: kellyStats } = await loadKellyEntries(
    SOURCE_DIR,
    existingLemmas,
    { report: process.argv.includes("--report") }
  );

  const merged = [...practiceEntries];
  for (const entry of kellyEntries) {
    merged.push(entry);
  }

  merged.sort((a, b) => {
    const sourceOrder = { practice: 0, kelly: 1 };
    const sa = sourceOrder[a.source] ?? 1;
    const sb = sourceOrder[b.source] ?? 1;
    if (sa !== sb) return sa - sb;
    return a.lemma.localeCompare(b.lemma, "sv");
  });

  writeUnifiedCsv(OUTPUT, merged);

  const practiceCount = merged.filter((e) => e.source !== "kelly").length;
  const kellyCount = merged.filter((e) => e.source === "kelly").length;

  console.log(`Wrote ${merged.length} rows to ${OUTPUT}`);
  console.log(
    `  Practice: ${practiceCount} (adj ${adjectives.length}, adv ${adverbs.length}, verbs ${verbs.length})`
  );
  console.log(`  Kelly: ${kellyCount}`);
  if (kellyStats) {
    if (kellyStats.usingDictionary) {
      console.log("  Using local SQLite dictionaries (sv-en, sv-pt)");
    }
    console.log(
      `  Kelly PT coverage: ${kellyStats.withPt}/${kellyStats.total} (${kellyStats.ptCoveragePct}%)`
    );
  }
  console.log(`  Columns: ${VOCABULARY_COLUMNS.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
