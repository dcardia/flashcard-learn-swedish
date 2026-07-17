/**
 * Gemini API wrapper for vocabulary sentence generation.
 * Auth via GEMINI_API_KEY or GOOGLE_API_KEY (x-goog-api-key header).
 */

const { sleep } = require("./translation-lib");

/** Cheapest + fastest tier; good for high-volume sentence generation. */
const CHEAP_FAST_MODEL = "gemini-flash-lite-latest";

const MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  CHEAP_FAST_MODEL,
  "gemini-3.1-flash-lite",
].filter(Boolean);

const DEFAULT_MODEL = process.env.GEMINI_MODEL || CHEAP_FAST_MODEL;
const DEFAULT_DELAY_MS = Number(process.env.GEMINI_DELAY_MS) || 1500;
const MAX_RETRIES = 5;

function getModelCandidates(preferred) {
  const list = preferred
    ? [preferred, ...MODEL_CANDIDATES]
    : [...MODEL_CANDIDATES];
  return [...new Set(list.filter(Boolean))];
}

function isModelUnavailableError(err) {
  const msg = err?.message || "";
  return (
    msg.includes("404") ||
    msg.includes("NOT_FOUND") ||
    msg.includes("no longer available")
  );
}

class QuotaError extends Error {
  constructor(message, retryAfterMs = 60000) {
    super(message);
    this.name = "QuotaError";
    this.retryAfterMs = retryAfterMs;
  }
}

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
}

function extractJsonText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}

function parseJsonPayload(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1].trim() : trimmed;
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Response did not contain a JSON object");
  }
  return JSON.parse(payload.slice(start, end + 1));
}

/**
 * @param {string} prompt
 * @param {{ model?: string, temperature?: number }} opts
 */
async function generateJson(prompt, opts = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "No API key found. Set GEMINI_API_KEY (or GOOGLE_API_KEY) in your environment."
    );
  }

  const model = opts.model || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.5,
        responseMimeType: "application/json",
      },
    }),
  });

  if (res.status === 429) {
    const body = await res.text();
    const exhausted = /limit:\s*0/i.test(body);
    const retryAfterMs = exhausted ? 0 : 60000;
    const err = new QuotaError(
      `Gemini quota/rate limit (429): ${body.slice(0, 200)}`,
      retryAfterMs
    );
    err.exhausted = exhausted;
    throw err;
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API ${res.status}: ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const text = extractJsonText(data);
  if (!text) {
    throw new Error("Gemini returned empty content");
  }

  return parseJsonPayload(text);
}

async function generateJsonWithRetry(prompt, opts = {}) {
  const delayMs = opts.delayMs ?? DEFAULT_DELAY_MS;
  const models = getModelCandidates(opts.model);
  let lastErr;

  for (const model of models) {
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        return await generateJson(prompt, { ...opts, model });
      } catch (err) {
        lastErr = err;

        if (isModelUnavailableError(err)) {
          if (model !== models[models.length - 1]) {
            process.stdout.write(`\n  Model ${model} unavailable, trying next...\n`);
          }
          break;
        }

        attempt++;
        if (attempt >= MAX_RETRIES) break;

        const wait =
          err instanceof QuotaError
            ? err.retryAfterMs
              ? err.retryAfterMs * attempt
              : 0
            : delayMs * Math.pow(2, attempt);

        if (!wait) break;

        process.stdout.write(
          `\n  Retry ${attempt}/${MAX_RETRIES - 1} in ${Math.round(wait / 1000)}s (${err.message.slice(0, 120)})...\n`
        );
        await sleep(wait);
      }
    }
  }

  throw lastErr || new Error("All Gemini models failed");
}

function buildSentencePrompt(entry) {
  const swedish = entry.swedish || entry.lemma;
  const en = entry.translations?.en || "—";
  const pt = entry.translations?.pt || "—";
  const isVerb = entry.type === "verb";

  const tenseRule = isVerb
    ? `- This is a VERB. Provide exactly 3 sentences: one in past tense (tense: "past"), one in present ("present"), one in future ("future"). Use natural Swedish verb forms of the target word.`
    : `- This is NOT a verb. Omit the "tense" field (or set null) on each example.`;

  return `You create Swedish vocabulary example sentences for language learners.

Target word: ${swedish}
Lemma: ${entry.lemma}
Word type: ${entry.type}
English gloss: ${en}
Portuguese (Brazil) gloss: ${pt}
CEFR level: ${entry.cefr || "unknown"}

Requirements:
- Return exactly 3 example sentences as JSON.
${tenseRule}
- Each Swedish sentence: 5–12 words, simple, natural, and meaningful for learners.
- The target word (or a correct inflected form) MUST appear in each Swedish sentence.
- Use DIFFERENT supporting vocabulary in each sentence — do not repeat the same side words (nouns, verbs, places) across examples; make the three sentences complementary.
- Provide full-sentence translations in English and Brazilian Portuguese (not word-by-word glosses only).
- For each sentence, include a word-by-word token breakdown aligned to the full sentence translation (how each Swedish word maps in THIS sentence, not dictionary definitions). Keep Swedish surface forms including punctuation.

Return ONLY valid JSON in this shape:
{
  "examples": [
    {
      "tense": "past|present|future|null",
      "sv": "Swedish sentence",
      "en": "English sentence",
      "pt": "Portuguese (Brazil) sentence",
      "tokens": [
        { "sv": "Word", "en": "aligned gloss", "pt": "glossa alinhada" }
      ]
    }
  ]
}`;
}

function buildTokenAlignmentPrompt(entry, examples) {
  const blocks = examples
    .map(
      (ex, i) =>
        `Example ${i + 1}:
Swedish: ${ex.sv}
English: ${ex.en}
Portuguese: ${ex.pt}`
    )
    .join("\n\n");

  return `You align Swedish vocabulary example sentences with contextual word-by-word glosses.

Target word: ${entry.swedish || entry.lemma}
Word type: ${entry.type}

For each example below, return one token per Swedish word (split on spaces, keep trailing punctuation on the Swedish token). Glosses must reflect how the word functions in THIS sentence translation — not generic dictionary definitions.

${blocks}

Return ONLY valid JSON:
{
  "examples": [
    {
      "sv": "exact Swedish sentence",
      "tokens": [
        { "sv": "Word", "en": "aligned gloss", "pt": "glossa alinhada" }
      ]
    }
  ]
}`;
}

module.exports = {
  CHEAP_FAST_MODEL,
  DEFAULT_MODEL,
  MODEL_CANDIDATES,
  getModelCandidates,
  DEFAULT_DELAY_MS,
  QuotaError,
  buildSentencePrompt,
  buildTokenAlignmentPrompt,
  generateJson,
  generateJsonWithRetry,
  getApiKey,
};
