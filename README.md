# Swedish Flashcards

A simple flashcard app for learning Swedish vocabulary. Built with plain HTML, CSS, and JavaScript — no frameworks.

## Features

- **Flashcards** — practice Swedish words with example sentences and word-by-word breakdowns
- **Filters** — focus on most common words (top 250 per word type) and/or CEFR level (A1–C2)
- **Vocabulary search** — lemma-aware search (finds verb conjugations, not just exact matches)
- **My Words** — library of words you've marked as known
- **Settings** — name and UI language (English or Português do Brasil)
- All progress stored in **localStorage**

## Vocabulary data

The single source of truth is **`data/source/vocabulary.csv`**.

Translations use **local SQLite dictionaries** in `data/dictionaries/`:

- `sv-en.sqlite3` — Swedish → English (primary)
- `sv-pt.sqlite3` — Swedish → Portuguese
- `folkets_sv_en_public.xml` — Folkets Swedish–English lexicon ([CC BY-SA 2.5](https://folkets-lexikon.csc.kth.se/folkets/folkets.html)); built to `folkets-sv-en.json` and used as an **English fallback** when SQLite has no match

```bash
# After updating or adding folkets_sv_en_public.xml
npm run build:folkets
```

Custom paths: `SV_EN_DICT`, `SV_PT_DICT`, and `FOLKETS_SV_EN_INDEX` environment variables.

### Build commands

```bash
npm install

# Migrate legacy CSVs + Kelly, then build (uses dictionaries, no API)
npm run build

# Same with translation coverage report
npm run build:offline

# Fill missing EN/PT in vocabulary.csv from dictionaries
npm run enrich

# Re-import legacy sources into vocabulary.csv
npm run build:migrate

# Fill remaining ~10% gaps via batched Google Translate (20 words/call, paced)
npm run build:translate

# Optional: official Cloud API instead of the free gtx client
export GOOGLE_TRANSLATE_API_KEY=your-key

# Tune batching (default: 20 words, 2.5s between requests)
export TRANSLATE_BATCH_SIZE=15
export TRANSLATE_BATCH_DELAY_MS=3000
npm run translate
```

### Example sentences (Gemini)

Generate 3 complementary example sentences for Kelly words that lack examples (top **3000** by frequency from the sorted Kelly CSV). Verbs get past / present / future examples.

```bash
cp .env.example .env   # add GEMINI_API_KEY — never commit .env
export GEMINI_API_KEY=your-key

# Enrich + rebuild app bundle (processes all pending top-3000 words)
npm run enrich:sentences

# Process a small batch first
npm run enrich:sentences -- --limit 10

# Apply cache to vocabulary.csv without API calls
node scripts/enrich-sentences.js --apply-cache

# Align word-by-word glosses to enriched sentence translations (uses cache + Gemini)
npm run enrich:sentence-tokens

# One entry or small batch
npm run enrich:sentence-tokens -- --id kelly-873-racka
npm run enrich:sentence-tokens -- --limit 20
```

Progress is saved after **each word** in:

- `data/sentence-enrichment-cache.json` — sentence cache keyed by entry ID
- `data/source/vocabulary.csv` — updated in place

Kelly source file must be frequency-sorted: `data/source/Swedish-Kelly_M3_CEFR - Swedish_M3_CEFR.csv`

Optional env: `GEMINI_MODEL` (default `gemini-flash-lite-latest` — cheap/fast), `GEMINI_DELAY_MS` (default 1500), `ENRICH_TOP_N`.

### Translation priority

1. Practice list data (hand-curated)
2. SQLite dictionaries (`simple_translation` table)
3. Numerals map
4. `data/en-pt-glossary.json` and `data/kelly-translation-cache.json` (fallback)
5. Google Translate (`npm run build:translate`) for remaining gaps — batched with pauses to avoid rate limits

**Current scale:** ~221 practice + ~7,700 Kelly words (~90% EN+PT from dictionaries).

## Running the app

Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080

## Data format

Each vocabulary entry includes:

- Swedish word (lemma) and type (verb, adjective, adverb, noun, etc.)
- Inflected forms for lemma-aware search
- Translations in English and Portuguese
- Example sentences with per-word token translations (practice lists), or usage notes (Kelly list)
