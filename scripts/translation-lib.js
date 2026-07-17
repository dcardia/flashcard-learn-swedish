/**
 * Shared translation cache, glossary, and offline resolution for Kelly vocabulary.
 */

const fs = require("fs");
const path = require("path");
const {
  lookupSvEn,
  lookupSvPt,
  dictionariesAvailable,
} = require("./dictionary-lib");

const CACHE_FILE = path.join(__dirname, "../data/kelly-translation-cache.json");
const GLOSSARY_FILE = path.join(__dirname, "../data/en-pt-glossary.json");
const KELLY_FILE = "Swedish-Kelly_M3_CEFR - Swedish_M3_CEFR.csv";

const NUMERALS = {
  noll: { en: "zero", pt: "zero" },
  en: { en: "one", pt: "um" },
  ett: { en: "one", pt: "um" },
  två: { en: "two", pt: "dois" },
  tre: { en: "three", pt: "três" },
  fyra: { en: "four", pt: "quatro" },
  fem: { en: "five", pt: "cinco" },
  sex: { en: "six", pt: "seis" },
  sju: { en: "seven", pt: "sete" },
  åtta: { en: "eight", pt: "oito" },
  nio: { en: "nine", pt: "nove" },
  tio: { en: "ten", pt: "dez" },
  elva: { en: "eleven", pt: "onze" },
  tolv: { en: "twelve", pt: "doze" },
  tretton: { en: "thirteen", pt: "treze" },
  fjorton: { en: "fourteen", pt: "catorze" },
  femton: { en: "fifteen", pt: "quinze" },
  sexton: { en: "sixteen", pt: "dezesseis" },
  sjutton: { en: "seventeen", pt: "dezessete" },
  arton: { en: "eighteen", pt: "dezoito" },
  nitton: { en: "nineteen", pt: "dezenove" },
  tjugo: { en: "twenty", pt: "vinte" },
  trettio: { en: "thirty", pt: "trinta" },
  fyrtio: { en: "forty", pt: "quarenta" },
  femtio: { en: "fifty", pt: "cinquenta" },
  sextio: { en: "sixty", pt: "sessenta" },
  sjuttio: { en: "seventy", pt: "setenta" },
  åttio: { en: "eighty", pt: "oitenta" },
  nittio: { en: "ninety", pt: "noventa" },
  hundra: { en: "hundred", pt: "cem" },
  tusen: { en: "thousand", pt: "mil" },
  miljon: { en: "million", pt: "milhão" },
  miljard: { en: "billion", pt: "bilhão" },
  hundratusen: { en: "one hundred thousand", pt: "cem mil" },
  första: { en: "first", pt: "primeiro" },
  andra: { en: "second", pt: "segundo" },
  tredje: { en: "third", pt: "terceiro" },
  fjärde: { en: "fourth", pt: "quarto" },
  femte: { en: "fifth", pt: "quinto" },
  sjätte: { en: "sixth", pt: "sexto" },
  sjunde: { en: "seventh", pt: "sétimo" },
  åttonde: { en: "eighth", pt: "oitavo" },
  nionde: { en: "ninth", pt: "nono" },
  tionde: { en: "tenth", pt: "décimo" },
};

let glossaryCache = null;

function loadGlossary() {
  if (glossaryCache) return glossaryCache;
  try {
    if (fs.existsSync(GLOSSARY_FILE)) {
      glossaryCache = JSON.parse(fs.readFileSync(GLOSSARY_FILE, "utf8"));
      return glossaryCache;
    }
  } catch {
    /* ignore */
  }
  glossaryCache = {};
  return glossaryCache;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      return {
        svEn: raw.svEn || {},
        enPt: raw.enPt || {},
        svPt: raw.svPt || {},
      };
    }
  } catch {
    /* ignore */
  }
  return { svEn: {}, enPt: {}, svPt: {} };
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function cleanEnglish(raw) {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s*\/\s*.+$/, "")
    .trim();
}

function lookupPt(en, cache, glossary) {
  if (!en) return null;
  const enKey = en.toLowerCase();
  return glossary[enKey] || cache.enPt[enKey] || null;
}

function resolveEnglish(item, cache) {
  if (item.en) return item.en;
  const key = item.lemma;
  if (NUMERALS[key]) return NUMERALS[key].en;
  const fromDict = lookupSvEn(item.swedish || key);
  if (fromDict) return fromDict;
  return cache.svEn[key] || null;
}

function resolvePortuguese(item, en, cache, glossary) {
  if (item.pt) return item.pt;
  const key = item.lemma;
  if (NUMERALS[key]) return NUMERALS[key].pt;
  const fromDict = lookupSvPt(item.swedish || key);
  if (fromDict) return fromDict;
  if (cache.svPt[key]) return cache.svPt[key];
  return lookupPt(en, cache, glossary);
}

/**
 * Apply offline translations (numerals, glossary, cache). Mutates items in place.
 * Returns coverage stats.
 */
function fillOfflineTranslations(items, cache = loadCache()) {
  const glossary = loadGlossary();
  const usingDict = dictionariesAvailable();
  let withEn = 0;
  let withPt = 0;

  for (const item of items) {
    const en = resolveEnglish(item, cache);
    if (en) {
      item.en = en;
      withEn++;
    }

    const pt = resolvePortuguese(item, en, cache, glossary);
    if (pt) {
      item.pt = pt;
      withPt++;
    }
  }

  return {
    total: items.length,
    withEn,
    withPt,
    missingEn: items.length - withEn,
    missingPt: items.length - withPt,
    ptCoveragePct: items.length
      ? Math.round((withPt / items.length) * 1000) / 10
      : 0,
    usingDictionary: usingDict,
  };
}

/**
 * Find Kelly words still missing translations after offline resolution.
 */
function findTranslationGaps(items, cache = loadCache()) {
  const glossary = loadGlossary();
  const needSvEnPt = [];
  const needPtOnly = [];

  for (const item of items) {
    const en = resolveEnglish(item, cache);
    const pt = resolvePortuguese(item, en, cache, glossary);

    if (!en) {
      needSvEnPt.push({
        lemma: item.lemma,
        swedish: item.swedish,
        wordClass: item.wordClass || item.type,
      });
    } else if (!pt) {
      needPtOnly.push({
        lemma: item.lemma,
        swedish: item.swedish,
        en,
      });
    }
  }

  return { needSvEnPt, needPtOnly };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = {
  CACHE_FILE,
  GLOSSARY_FILE,
  KELLY_FILE,
  NUMERALS,
  cleanEnglish,
  fillOfflineTranslations,
  findTranslationGaps,
  loadCache,
  loadGlossary,
  lookupPt,
  resolveEnglish,
  resolvePortuguese,
  saveCache,
  sleep,
  dictionariesAvailable,
};
