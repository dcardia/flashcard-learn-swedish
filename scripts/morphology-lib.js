/**
 * Swedish inflection helpers shared by dictionary and Folkets lookups.
 */

function generateSingularCandidates(word) {
  const key = word.trim().toLowerCase().normalize("NFC");
  const candidates = [];
  const add = (candidate) => {
    if (!candidate || candidate.length < 2 || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  add(key);

  if (key.startsWith("i") && key.length > 2 && !key.includes(" ")) {
    add(`i ${key.slice(1)}`);
  }

  if (key.endsWith("la") && key.length > 3) {
    const stem = key.slice(0, -2);
    add(stem + "el");
    add(stem + "al");
    add(stem + "mal");
  }
  if (key.endsWith("ra") && key.length > 3) {
    const stem = key.slice(0, -2);
    add(stem + "er");
  }
  if (key.endsWith("a") && key.length > 3) {
    add(key.slice(0, -1));
    add(key.slice(0, -1) + "e");
  }

  if (key.endsWith("arna")) {
    add(key.slice(0, -4) + "e");
    add(key.slice(0, -4));
  }
  if (key.endsWith("orna")) {
    add(key.slice(0, -4) + "a");
  }
  if (key.endsWith("na") && key.length > 4) {
    add(key.slice(0, -2));
    add(
      key
        .slice(0, -2)
        .replace(/ö/g, "o")
        .replace(/ä/g, "a")
        .replace(/å/g, "a")
    );
  }

  if (key.endsWith("en") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -1));
  }

  if (
    key.endsWith("n") &&
    key.length > 3 &&
    !key.endsWith("en") &&
    !key.endsWith("nn")
  ) {
    add(key.slice(0, -1));
  }

  if (key.endsWith("rar") && key.length > 4) {
    add(key.replace(/rar$/, "er"));
  }

  if (key.endsWith("ar") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -2) + "e");
  }

  if (key.endsWith("or") && key.length > 3) {
    add(key.slice(0, -2) + "a");
  }

  if (key.endsWith("öcker")) {
    add(key.slice(0, -5) + "ok");
  }
  if (key.endsWith("ocker")) {
    add(key.slice(0, -5) + "ok");
  }

  if (key.endsWith("er") && key.length > 3) {
    add(key.slice(0, -2));
    add(key.slice(0, -1));
    add(
      key
        .slice(0, -2)
        .replace(/ö/g, "o")
        .replace(/ä/g, "a")
        .replace(/å/g, "a")
    );
  }

  return candidates;
}

function pluralizeEnglishGloss(surfaceForm, lemma, gloss) {
  if (!gloss || surfaceForm.toLowerCase() === lemma.toLowerCase()) return gloss;
  if (lemma.includes(" ")) return gloss;
  if (gloss.includes("/") || gloss.includes(" ")) return gloss;
  const word = gloss.trim();
  if (!word) return gloss;
  if (/^(to|a|an|the)\s/i.test(word)) return gloss;
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch")) {
    return `${word}es`;
  }
  if (word.endsWith("y") && !/[aeiou]y$/i.test(word)) {
    return `${word.slice(0, -1)}ies`;
  }
  return `${word}s`;
}

module.exports = {
  generateSingularCandidates,
  pluralizeEnglishGloss,
};
