/**
 * Folkets Swedish–English dictionary (CC BY-SA 2.5).
 * JSON index built from data/dictionaries/folkets_sv_en_public.xml
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_XML = path.join(
  __dirname,
  "../data/dictionaries/folkets_sv_en_public.xml"
);
const DEFAULT_INDEX = path.join(
  __dirname,
  "../data/dictionaries/folkets-sv-en.json"
);

let folketsIndex = null;

function getFolketsIndexPath() {
  const fromEnv = process.env.FOLKETS_SV_EN_INDEX;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  return DEFAULT_INDEX;
}

function decodeXml(text) {
  return text
    .replace(/&amp;quot;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractWordValue(openTag) {
  const match = openTag.match(/\bvalue="([^"]*)"/i);
  return match ? decodeXml(match[1]) : null;
}

function extractHeadTranslations(block) {
  const stopTags = [
    "<example",
    "<definition",
    "<idiom",
    "<explanation",
    "<related",
    "<synonym",
    "<see",
    "<paradigm",
    "<variant",
  ];
  let head = block;
  for (const tag of stopTags) {
    const idx = block.indexOf(tag);
    if (idx !== -1) head = head.slice(0, Math.min(head.length, idx));
  }

  const translations = [];
  const re = /<translation[^>]*\bvalue="([^"]*)"/gi;
  let match;
  while ((match = re.exec(head)) !== null) {
    const value = decodeXml(match[1]);
    if (value && !translations.includes(value)) translations.push(value);
  }
  return translations;
}

function extractForms(block) {
  const forms = [];
  const re = /<(?:inflection|variant)[^>]*\bvalue="([^"]*)"/gi;
  let match;
  while ((match = re.exec(block)) !== null) {
    const value = decodeXml(match[1]).toLowerCase();
    if (value && !forms.includes(value)) forms.push(value);
  }
  return forms;
}

function addToIndex(index, key, translations) {
  const normalized = key.toLowerCase().trim();
  if (!normalized || !translations.length) return;

  if (!index[normalized]) index[normalized] = [];
  for (const t of translations) {
    if (!index[normalized].includes(t)) index[normalized].push(t);
  }
}

function buildFolketsIndex(xmlPath = DEFAULT_XML) {
  if (!fs.existsSync(xmlPath)) {
    throw new Error(`Folkets XML not found: ${xmlPath}`);
  }

  const xml = fs.readFileSync(xmlPath, "utf8");
  const index = {};
  const blocks = xml.split("</word>");

  for (const raw of blocks) {
    const openIdx = raw.lastIndexOf("<word");
    if (openIdx === -1) continue;

    const openTagEnd = raw.indexOf(">", openIdx);
    if (openTagEnd === -1) continue;

    const openTag = raw.slice(openIdx, openTagEnd + 1);
    const body = raw.slice(openTagEnd + 1);
    const swedish = extractWordValue(openTag);
    if (!swedish) continue;

    const translations = extractHeadTranslations(body);
    if (!translations.length) continue;

    const lemma = swedish.toLowerCase();
    addToIndex(index, lemma, translations);

    for (const form of extractForms(body)) {
      addToIndex(index, form, translations);
    }
  }

  return index;
}

function writeFolketsIndex(outputPath = DEFAULT_INDEX, xmlPath = DEFAULT_XML) {
  const index = buildFolketsIndex(xmlPath);
  fs.writeFileSync(outputPath, JSON.stringify(index));
  return {
    outputPath,
    entries: Object.keys(index).length,
  };
}

function loadFolketsIndex() {
  if (folketsIndex) return folketsIndex;

  const indexPath = getFolketsIndexPath();
  if (!fs.existsSync(indexPath)) return null;

  folketsIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  return folketsIndex;
}

function folketsAvailable() {
  return fs.existsSync(getFolketsIndexPath());
}

function formatFolketsTranslations(translations, maxSenses = 2) {
  if (!translations?.length) return null;
  if (translations.length === 1 || maxSenses === 1) return translations[0];
  return translations.slice(0, maxSenses).join(" / ");
}

function lookupFolketsSvEn(swedish) {
  const index = loadFolketsIndex();
  if (!index || !swedish) return null;

  const { generateSingularCandidates, pluralizeEnglishGloss } = require(
    "./morphology-lib"
  );
  const surface = swedish.trim().toLowerCase();

  for (const candidate of generateSingularCandidates(swedish)) {
    const translations = index[candidate];
    if (!translations?.length) continue;

    const text = formatFolketsTranslations(translations);
    if (!text) continue;

    if (candidate !== surface) {
      return pluralizeEnglishGloss(swedish, candidate, text);
    }
    return text;
  }

  return null;
}

module.exports = {
  DEFAULT_INDEX,
  DEFAULT_XML,
  buildFolketsIndex,
  writeFolketsIndex,
  loadFolketsIndex,
  folketsAvailable,
  lookupFolketsSvEn,
};
