/**
 * Batch Google Translate with rate limiting.
 *
 * Uses the official Cloud Translation API when GOOGLE_TRANSLATE_API_KEY is set,
 * otherwise the public gtx client (newline-delimited batches).
 */

const { sleep } = require("./translation-lib");

const DEFAULT_BATCH_SIZE = Number(process.env.TRANSLATE_BATCH_SIZE) || 20;
const DEFAULT_DELAY_MS = Number(process.env.TRANSLATE_BATCH_DELAY_MS) || 2500;
const MAX_RETRIES = 4;

class RateLimitError extends Error {
  constructor(message = "Rate limited") {
    super(message);
    this.name = "RateLimitError";
  }
}

function getApiKey() {
  return (
    process.env.GOOGLE_TRANSLATE_API_KEY ||
    process.env.GOOGLE_CLOUD_API_KEY ||
    null
  );
}

function parseGtxResponse(data, expectedCount) {
  const segments = data?.[0];
  if (!Array.isArray(segments)) return null;

  const full = segments.map((s) => s[0] || "").join("");
  let lines = full.split("\n").map((s) => s.trim());

  if (lines.length > expectedCount && lines[lines.length - 1] === "") {
    lines = lines.slice(0, -1);
  }

  if (lines.length === expectedCount) return lines;
  return null;
}

async function translateGtxBatch(words, { source, target }) {
  if (!words.length) return [];

  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: words.join("\n"),
  });

  const res = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params}`
  );

  if (res.status === 429) {
    throw new RateLimitError(`HTTP 429 (batch of ${words.length})`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Translate ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const lines = parseGtxResponse(data, words.length);
  if (lines) return lines;

  throw new Error(
    `Response line count mismatch (expected ${words.length}, got ${data?.[0]?.length ?? 0} segments)`
  );
}

async function translateCloudBatch(words, { source, target, apiKey }) {
  if (!words.length) return [];

  const res = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: words,
        source,
        target,
        format: "text",
      }),
    }
  );

  if (res.status === 429) {
    throw new RateLimitError(`Cloud API 429 (batch of ${words.length})`);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Cloud Translate ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const translations = data?.data?.translations;
  if (!Array.isArray(translations) || translations.length !== words.length) {
    throw new Error("Unexpected Cloud Translation API response shape");
  }

  return translations.map((t) => (t.translatedText || "").trim());
}

async function translateBatchOnce(words, { source, target, apiKey }) {
  if (apiKey) {
    return translateCloudBatch(words, { source, target, apiKey });
  }
  return translateGtxBatch(words, { source, target });
}

/**
 * Translate a batch with retries. On line-count mismatch, splits the batch in half.
 */
async function translateBatch(words, options) {
  if (!words.length) return [];

  try {
    return await translateBatchOnce(words, options);
  } catch (err) {
    if (words.length === 1) throw err;

    const mid = Math.ceil(words.length / 2);
    const left = await translateBatch(words.slice(0, mid), options);
    if (options.delayMs) await sleep(options.delayMs);
    const right = await translateBatch(words.slice(mid), options);
    return [...left, ...right];
  }
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Run batched translations with pacing between requests.
 *
 * @param {string[]} words - texts to translate (order preserved)
 * @param {{ source: string, target: string, onProgress?: (done: number, total: number) => void }} opts
 * @returns {Promise<string[]>} translations aligned with input words
 */
async function translateAll(words, opts = {}) {
  const {
    source,
    target,
    batchSize = DEFAULT_BATCH_SIZE,
    delayMs = DEFAULT_DELAY_MS,
    onProgress,
  } = opts;

  const apiKey = getApiKey();
  const batches = chunk(words, batchSize);
  const results = new Array(words.length);
  let done = 0;

  for (const batch of batches) {
    let attempt = 0;
    let translations;

    while (attempt < MAX_RETRIES) {
      try {
        translations = await translateBatch(batch, {
          source,
          target,
          apiKey,
          delayMs,
        });
        break;
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES) throw err;
        const wait =
          err instanceof RateLimitError
            ? delayMs * Math.pow(2, attempt + 1)
            : delayMs * attempt;
        process.stdout.write(
          `\n  Retry ${attempt}/${MAX_RETRIES - 1} in ${wait}ms (${err.message})...\n`
        );
        await sleep(wait);
      }
    }

    const startIdx = done;
    for (let i = 0; i < batch.length; i++) {
      results[startIdx + i] = translations[i] || "";
    }
    done += batch.length;
    onProgress?.(done, words.length);

    if (done < words.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DEFAULT_DELAY_MS,
  RateLimitError,
  getApiKey,
  translateAll,
  translateBatch,
};
