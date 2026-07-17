/**
 * Offline Swedish dictionary lookups via local SQLite files.
 * Uses Node's built-in node:sqlite (readonly).
 */

const fs = require("fs");
const path = require("path");

const DICT_DIR = path.join(__dirname, "../data/dictionaries");
const DEFAULT_SV_EN = path.join(DICT_DIR, "sv-en.sqlite3");
const DEFAULT_SV_PT = path.join(DICT_DIR, "sv-pt.sqlite3");

let svEnDb = null;
let svPtDb = null;

function getDictPath(envKey, defaultPath) {
  const fromEnv = process.env[envKey];
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return defaultPath;
}

function openDb(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(filePath, { readOnly: true });
}

function getSvEnDb() {
  if (svEnDb !== null) return svEnDb;
  svEnDb = openDb(getDictPath("SV_EN_DICT", DEFAULT_SV_EN)) || false;
  return svEnDb;
}

function getSvPtDb() {
  if (svPtDb !== null) return svPtDb;
  svPtDb = openDb(getDictPath("SV_PT_DICT", DEFAULT_SV_PT)) || false;
  return svPtDb;
}

function dictionariesAvailable() {
  return Boolean(getSvEnDb() || getSvPtDb());
}

function formatTransList(transList, maxSenses = 2) {
  if (!transList) return null;
  const parts = transList
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1 || maxSenses === 1) return parts[0];
  return parts.slice(0, maxSenses).join(" / ");
}

const LOOKUP_SQL = `
  SELECT trans_list, max_score
  FROM simple_translation
  WHERE written_rep = ? COLLATE NOCASE
  ORDER BY max_score DESC
  LIMIT 1
`;

function lookupInDb(db, swedish) {
  if (!db || !swedish) return null;
  const key = swedish.trim();
  if (!key) return null;

  let row = db.prepare(LOOKUP_SQL).get(key);
  if (!row && key !== key.toLowerCase()) {
    row = db.prepare(LOOKUP_SQL).get(key.toLowerCase());
  }
  return row ? formatTransList(row.trans_list) : null;
}

const {
  generateSingularCandidates,
  pluralizeEnglishGloss,
} = require("./morphology-lib");

function lookupInDbWithFallback(db, swedish) {
  if (!db || !swedish) return null;

  for (const candidate of generateSingularCandidates(swedish)) {
    const hit = lookupInDb(db, candidate);
    if (hit) {
      return {
        text: hit,
        lemma: candidate,
        viaFallback: candidate !== swedish.trim().toLowerCase(),
      };
    }
  }

  return null;
}

function lookupSvEn(swedish) {
  const hit = lookupInDbWithFallback(getSvEnDb(), swedish);
  if (hit) {
    if (hit.viaFallback) {
      return pluralizeEnglishGloss(swedish, hit.lemma, hit.text);
    }
    return hit.text;
  }

  const { lookupFolketsSvEn } = require("./folkets-lib");
  return lookupFolketsSvEn(swedish);
}

function lookupSvPt(swedish) {
  const hit = lookupInDbWithFallback(getSvPtDb(), swedish);
  return hit ? hit.text : null;
}

function lookupSvLemma(swedish) {
  const hit =
    lookupInDbWithFallback(getSvEnDb(), swedish) ||
    lookupInDbWithFallback(getSvPtDb(), swedish);
  return hit ? hit.lemma : null;
}

/**
 * Resolve EN + PT for a Swedish lemma using local dictionaries.
 * Existing translations take priority.
 */
function lookupTranslations(swedish, existing = {}) {
  const en =
    existing.en && existing.en !== "—"
      ? existing.en
      : lookupSvEn(swedish);
  const pt =
    existing.pt && existing.pt !== "—"
      ? existing.pt
      : lookupSvPt(swedish);
  return { en: en || null, pt: pt || null };
}

function closeDictionaries() {
  if (svEnDb && svEnDb !== false) {
    svEnDb.close();
    svEnDb = null;
  }
  if (svPtDb && svPtDb !== false) {
    svPtDb.close();
    svPtDb = null;
  }
}

module.exports = {
  DEFAULT_SV_EN,
  DEFAULT_SV_PT,
  closeDictionaries,
  dictionariesAvailable,
  formatTransList,
  generateSingularCandidates,
  lookupSvEn,
  lookupSvPt,
  lookupSvLemma,
  lookupTranslations,
};
