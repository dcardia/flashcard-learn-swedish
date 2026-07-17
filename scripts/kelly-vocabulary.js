/**

 * Parses Kelly CEFR Swedish vocabulary CSV.

 * Translations use offline glossary + cache (no external API by default).

 */



const fs = require("fs");

const path = require("path");

const {

  KELLY_FILE,

  fillOfflineTranslations,

  loadCache,

  loadGlossary,

} = require("./translation-lib");



const CACHE_FILE = path.join(__dirname, "../data/kelly-translation-cache.json");



function slugify(text) {

  return text

    .toLowerCase()

    .normalize("NFD")

    .replace(/[\u0300-\u036f]/g, "")

    .replace(/[^a-z0-9]+/g, "-")

    .replace(/^-|-$/g, "");

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



function cleanEnglish(raw) {

  if (!raw) return "";

  return raw

    .trim()

    .replace(/\s*\([^)]*\)/g, "")

    .replace(/\s*\/\s*.+$/, "")

    .trim();

}



function mapWordClass(wordClass) {

  const wc = (wordClass || "").toLowerCase();

  if (wc === "verb" || wc === "aux verb" || wc === "particip") return "verb";

  if (wc === "adjective") return "adjective";

  if (wc === "adverb") return "adverb";

  if (wc.startsWith("noun")) return "noun";

  if (wc === "numeral") return "numeral";

  if (wc === "prep") return "preposition";

  if (wc === "pronoun") return "pronoun";

  if (wc === "proper name") return "proper name";

  if (wc === "conj" || wc === "subj") return "conjunction";

  if (wc === "interj") return "interjection";

  if (wc === "particle") return "particle";

  if (wc === "det") return "determiner";

  return "other";

}



function parseKellyRows(content) {

  const rows = parseCsv(content).slice(5);

  const glossary = loadGlossary();

  const parsed = [];



  for (const row of rows) {

    const id = (row[0] || "").trim();

    const swedish = cleanSwedish(row[6] || "");

    const wordClass = (row[7] || "").trim();

    const examples = (row[8] || "").trim();

    const english = cleanEnglish(row[9] || "");

    const cefr = (row[3] || "").trim();
    const frequency = parseFloat(String(row[1] || "").replace(/,/g, "")) || 0;
    const wpm = parseFloat(String(row[2] || "").replace(/,/g, "")) || 0;



    if (!swedish || !id) continue;



    const lemma = swedish.toLowerCase().split(/\s+/)[0];

    parsed.push({

      kellyId: id,

      swedish,

      lemma,

      type: mapWordClass(wordClass),

      wordClass,

      cefr,

      frequency,

      wpm,

      usageNote: examples || null,

      en: english || null,

      pt: english ? glossary[english.toLowerCase()] || null : null,

    });

  }

  return parsed;

}



function toEntries(parsed, existingLemmas) {

  const entries = [];

  const seen = new Set(existingLemmas);



  for (const item of parsed) {

    if (seen.has(item.lemma)) continue;

    seen.add(item.lemma);



    const en = item.en || "—";

    const pt = item.pt || "—";

    if (en === "—" && pt === "—") continue;



    const entry = {

      id: `kelly-${item.kellyId}-${slugify(item.lemma)}`,

      lemma: item.lemma,

      type: item.type,

      swedish: item.swedish,

      forms: [item.lemma],

      translations: { en, pt },

      source: "kelly",

      cefr: item.cefr || null,

      frequency: item.frequency || 0,

      wpm: item.wpm || 0,

      examples: [],

    };



    if (item.usageNote) {

      entry.usageNote = item.usageNote;

    }



    entries.push(entry);

  }

  return entries;

}



async function loadKellyEntries(sourceDir, existingLemmas, options = {}) {

  const filePath = path.join(sourceDir, KELLY_FILE);

  if (!fs.existsSync(filePath)) {

    console.log("Kelly CSV not found, skipping.");

    return { entries: [], stats: null };

  }



  console.log("Processing Kelly CEFR vocabulary...");

  const content = fs.readFileSync(filePath, "utf8");

  const parsed = parseKellyRows(content);

  const newItems = parsed.filter((p) => !existingLemmas.has(p.lemma));

  console.log(`  Kelly rows: ${parsed.length}, new lemmas: ${newItems.length}`);



  const cache = loadCache();

  const stats = fillOfflineTranslations(newItems, cache);



  if (options.report || process.argv.includes("--report")) {

    console.log(

      `  Translation coverage: EN ${stats.withEn}/${stats.total}, PT ${stats.withPt}/${stats.total} (${stats.ptCoveragePct}%)`

    );

    if (stats.missingEn || stats.missingPt) {

      console.log(

        `  Gaps — missing EN: ${stats.missingEn}, missing PT: ${stats.missingPt}`

      );

      console.log(
        "  Tip: run npm run enrich for dictionary gaps, or npm run build:translate for Google Translate"
      );

    }

  }



  const entries = toEntries(newItems, existingLemmas);

  console.log(`  Added ${entries.length} Kelly entries`);

  return { entries, stats };

}



module.exports = {

  loadKellyEntries,

  parseKellyRows,

  KELLY_FILE,

  CACHE_FILE,

};


