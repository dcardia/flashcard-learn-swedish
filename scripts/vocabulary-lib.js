/**
 * Shared vocabulary parsing, token building, and unified CSV helpers.
 */

const fs = require("fs");
const path = require("path");
const { lookupTranslations, lookupSvEn, lookupSvPt, lookupSvLemma, dictionariesAvailable } = require("./dictionary-lib");

const MOST_COMMON_PER_TYPE = 250;
const MANUAL_WPM_SENTINEL = 999_999;

function parseKellyNumber(raw) {
  if (raw == null || raw === "") return 0;
  const n = parseFloat(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function rankFrequency(entry) {
  const freq = Number(entry.frequency) || 0;
  const wpm = Number(entry.wpm) || 0;
  if (freq > 0) return freq;
  if (wpm > 0 && wpm < MANUAL_WPM_SENTINEL) return wpm;
  return 0;
}

/**
 * Mark the top N words per type by frequency (raw freq, else WPM).
 */
function applyMostCommonFlags(entries, perType = MOST_COMMON_PER_TYPE) {
  const byType = new Map();

  for (const entry of entries) {
    entry.mostCommon = false;
    const score = rankFrequency(entry);
    if (score <= 0) continue;
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type).push({ entry, score });
  }

  for (const list of byType.values()) {
    list.sort((a, b) => b.score - a.score);
    for (const { entry } of list.slice(0, perType)) {
      entry.mostCommon = true;
    }
  }
}

/**
 * Attach Kelly frequency/WPM/CEFR from parsed Kelly rows (by lemma).
 */
function mergeKellyMetadata(entries, kellyItems) {
  const byLemma = new Map();

  for (const item of kellyItems) {
    const lemma = item.lemma;
    if (!lemma) continue;
    const existing = byLemma.get(lemma);
    const itemScore = rankFrequency(item);
    const existingScore = existing ? rankFrequency(existing) : -1;
    if (!existing || itemScore > existingScore) {
      byLemma.set(lemma, item);
    }
  }

  for (const entry of entries) {
    const item = byLemma.get(entry.lemma);
    if (!item) continue;
    if (item.frequency != null) entry.frequency = item.frequency;
    if (item.wpm != null) entry.wpm = item.wpm;
    if (item.cefr && !entry.cefr) entry.cefr = item.cefr;
  }
}

const VOCABULARY_COLUMNS = [
  "id",
  "lemma",
  "type",
  "english",
  "portuguese",
  "forms",
  "cefr",
  "frequency",
  "wpm",
  "source",
  "ex1_sv",
  "ex1_en",
  "ex1_pt",
  "ex1_tense",
  "ex1_tokens",
  "ex2_sv",
  "ex2_en",
  "ex2_pt",
  "ex2_tense",
  "ex2_tokens",
  "ex3_sv",
  "ex3_en",
  "ex3_pt",
  "ex3_tense",
  "ex3_tokens",
  "usage_note",
];

const TENSE_LABELS = {
  past: { en: "Past", pt: "Passado" },
  present: { en: "Present", pt: "Presente" },
  future: { en: "Future", pt: "Futuro" },
};

const PT_TO_EN = {
  "Ser/Estar": "to be",
  Ter: "to have",
  Fazer: "to do / make",
  "Ir/Andar": "to go / walk",
  Dizer: "to say",
  Poder: "to be able to",
  Ver: "to see",
  Saber: "to know",
  Querer: "to want",
  Falar: "to speak",
  Vir: "to come",
  "Pegar/Tomar": "to take",
  Receber: "to receive / get",
  Começar: "to begin",
  Terminar: "to finish",
  Comer: "to eat",
  Beber: "to drink",
  Dormir: "to sleep",
  Trabalhar: "to work",
  Comprar: "to buy",
  Vender: "to sell",
  Ler: "to read",
  Escrever: "to write",
  Encontrar: "to find",
  Pensar: "to think",
  Acreditar: "to believe",
  Ajudar: "to help",
  Esperar: "to wait",
  Perguntar: "to ask",
  Responder: "to answer",
  Morar: "to live (reside)",
  Viver: "to live",
  Morrer: "to die",
  Amar: "to love",
  Odiar: "to hate",
  Precisar: "to need",
  Usar: "to use",
  Entender: "to understand",
  Segurar: "to hold",
  Olhar: "to look",
  Ouvir: "to listen",
  Correr: "to run",
  Sentar: "to sit",
  "Estar de pé": "to stand",
  "Localizar-se": "to lie (position)",
  "Sentir/Conhecer": "to feel / know",
  "Encontrar(ps)": "to meet",
  Viajar: "to travel",
  Aprender: "to learn",
  Esquecer: "to forget",
  Tentar: "to try",
  Mostrar: "to show",
  Enviar: "to send",
  Acontecer: "to happen",
  "Ganhar/Vencer": "to win",
  Perder: "to lose",
  Pagar: "to pay",
  "Ligar (tel.)": "to call (phone)",
  Significar: "to mean",
  Trazer: "to bring",
  Mudar: "to change",
  Escolher: "to choose",
  "Esperar (esp.)": "to hope",
  Sorrir: "to smile",
  Chorar: "to cry",
  Lavar: "to wash",
  Limpar: "to clean",
  Abrir: "to open",
  Fechar: "to close",
  Cozinhar: "to cook",
  Lembrar: "to remember",
  "Contar (nar.)": "to tell",
  Parecer: "to seem",
  "Precisar (ter de)": "must / have to",
  "Usar (vestir)": "to wear",
  Explicar: "to explain",
  Prometer: "to promise",
  Desenhar: "to draw",
  Cantar: "to sing",
  Dançar: "to dance",
  "Jogar (brincar)": "to play",
  Beijar: "to kiss",
  Escutar: "to hear",
  Parar: "to stop",
  Continuar: "to continue",
  Crescer: "to grow",
  Cair: "to fall",
  Gritar: "to scream",
  "Ganhar (dinheiro)": "to earn",
  Pintar: "to paint",
  Desejar: "to wish",
  Bom: "good",
  Grande: "big / large",
  Pequeno: "small",
  Novo: "new",
  Velho: "old",
  Feliz: "happy",
  Triste: "sad",
  Cansado: "tired",
  Quente: "hot / warm",
  Frio: "cold",
  Bonito: "beautiful / fine",
  Mau: "bad",
  Caro: "expensive",
  Barato: "cheap",
  "Difícil": "difficult",
  "Fácil": "easy",
  Importante: "important",
  Faminto: "hungry",
  Sedento: "thirsty",
  "Rápido": "fast",
  Lento: "slow",
  Rico: "rich",
  Pobre: "poor",
  Inteiro: "whole / entire",
  Vermelho: "red",
  Curto: "short",
  Longo: "long",
  "Alto (pessoa)": "tall",
  "Baixo (pessoa)": "short (person)",
  Largo: "wide",
  Estreito: "narrow",
  Gordo: "fat / thick",
  Magro: "thin / slim",
  Doente: "sick",
  "Saudável": "healthy",
  "Certo/Correto": "correct / right",
  Errado: "wrong",
  "Próximo": "next",
  "Último": "last",
  Diferente: "different",
  Igual: "equal / same",
  Sozinho: "alone",
  Cheio: "full",
  Vazio: "empty",
  Pesado: "heavy",
  Leve: "light (weight)",
  Escuro: "dark",
  Claro: "light / bright",
  Sujo: "dirty",
  Limpo: "clean",
  Maduro: "ripe / mature",
  Estranho: "strange",
  Comum: "common / ordinary",
  Raro: "rare / unusual",
  Perigoso: "dangerous",
  Seguro: "safe / sure",
  Calmo: "calm",
  Barulhento: "loud",
  Silencioso: "silent",
  "Grátis": "free (no cost)",
  Interessante: "interesting",
  Chato: "boring / annoying",
  Gentil: "kind",
  Cruel: "cruel",
  Profundo: "deep",
  Raso: "shallow",
  Justo: "fair",
  Injusto: "unfair",
  "Útil": "useful",
  "Inútil": "useless",
  "Não": "not",
  "Também": "also",
  Sempre: "always",
  Nunca: "never",
  Talvez: "maybe",
  Agora: "now",
  Muito: "much / very",
  Aqui: "here",
  "Só/Apenas": "only / just",
  Frequentemente: "often",
  Raramente: "rarely",
  "Lá/Ali": "there",
  Depois: "after / later",
  "Logo/Em breve": "soon",
  "Já": "already",
  Ainda: "still",
  Realmente: "really",
  Quase: "almost",
  "Às vezes": "sometimes",
  Hoje: "today",
  Ontem: "yesterday",
  "Amanhã": "tomorrow",
  Juntos: "together",
  "Bastante/Bem": "quite / rather",
  Novamente: "again",
  Especialmente: "especially",
  Finalmente: "finally",
  Certamente: "certainly",
  Infelizmente: "unfortunately",
  Provavelmente: "probably",
  Absolutamente: "absolutely",
  "Logo/Já": "shortly / soon",
  "Em casa": "at home",
  Fora: "outside",
  Dentro: "inside",
  Longe: "far",
  Perto: "near",
  "Em cima": "upstairs / above",
  "Em baixo": "downstairs / below",
  "Atrás": "behind",
  "Na frente": "in front / ahead",
  "De novo": "again",
  "Talvez (formal)": "possibly",
  Exatamente: "exactly",
  Bastante: "quite / rather",
  "Logo depois": "afterwards",
  Constantemente: "constantly",
  "Quase nunca": "hardly ever",
  "De jeito nenhum": "not at all",
  Pedir: "to ask / request",
  "Receber/Ficar": "to become / get",
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function cleanPtLabel(raw) {
  return raw.replace(/^\d+\.\s*/, "").trim();
}

function toEn(ptLabel) {
  const clean = cleanPtLabel(ptLabel);
  if (PT_TO_EN[clean]) return PT_TO_EN[clean];
  return clean;
}

function parseExtras(raw) {
  if (!raw || raw.trim() === "—" || raw.trim() === "-") return [];
  const pairs = [];
  const parts = raw.split(/\s*\/\s*/);
  for (const part of parts) {
    const match = part.match(/^(.+?)\s*[—–-]\s*(.+)$/);
    if (match) {
      pairs.push({
        swedish: match[1].trim(),
        pt: match[2].trim(),
      });
    }
  }
  return pairs;
}

const PT_WORD_EN = {
  o: "the",
  a: "the",
  os: "the",
  as: "the",
  um: "a",
  uma: "a",
  eu: "I",
  você: "you",
  ele: "he",
  ela: "she",
  nós: "we",
  eles: "they",
  de: "of",
  para: "to",
  com: "with",
  em: "in",
  no: "in the",
  na: "in the",
  do: "of the",
  da: "of the",
  sobre: "about",
  por: "for",
  porquê: "why",
  quê: "what",
  isso: "that",
  isto: "this",
  tudo: "everything",
  bom: "good",
  bem: "well",
  muito: "much",
  ajuda: "help",
  livro: "book",
  carro: "car",
  casa: "house",
  comida: "food",
  água: "water",
  peixe: "fish",
  pão: "bread",
  dia: "day",
  noite: "night",
  agora: "now",
  aqui: "here",
  lá: "there",
  amanhã: "tomorrow",
  ontem: "yesterday",
  hoje: "today",
  feliz: "happy",
  cansado: "tired",
  frio: "cold",
  quente: "hot",
  carne: "meat",
  criança: "child",
  crianças: "children",
  pergunta: "question",
  resposta: "answer",
  viagem: "trip",
  caminho: "road",
  estrada: "road",
  rua: "street",
  gato: "cat",
  cachorro: "dog",
  vestido: "dress",
  filme: "movie",
  demasiado: "too",
  fora: "outside",
  semana: "week",
  ônibus: "bus",
  copo: "glass",
  garrafa: "bottle",
  bolsa: "bag",
  quarto: "room",
  sala: "room",
  blusa: "sweater",
  suéter: "sweater",
  fruta: "fruit",
  pássaro: "bird",
  vizinho: "neighbor",
  relógio: "clock",
  país: "country",
  homem: "man",
  máquina: "machine",
  piscina: "pool",
  lago: "lake",
  professor: "teacher",
  sorvete: "ice cream",
  nome: "name",
  tempo: "time",
  sol: "sun",
  chave: "key",
  mão: "hand",
  cama: "bed",
  celular: "phone",
  dinheiro: "money",
  ouro: "gold",
  riso: "laughter",
  carta: "letter",
  jornal: "newspaper",
  trem: "train",
  dez: "ten",
  entendo: "understand",
  vem: "comes",
  comemos: "eat",
  moro: "live",
  mora: "lives",
  moramos: "live",
  custa: "costs",
  brincam: "play",
  espero: "wait",
  esperando: "waiting",
  esperam: "wait",
  acontece: "happens",
  estava: "was",
  foi: "was",
  fala: "speaks",
  vejo: "see",
  ligou: "called",
  verdade: "true",
  pronto: "ready",
  terminado: "finished",
  está: "is",
  estou: "am",
  estás: "are",
  pode: "can",
  posso: "can",
  dizer: "say",
  obrigado: "thank you",
  depressa: "fast",
  alto: "loud",
  volume: "volume",
  cartas: "cards",
  baralho: "deck",
  felicidade: "happiness",
  quadro: "painting",
  partida: "match",
  jogo: "game",
  prêmio: "prize",
  conta: "bill",
  pacote: "package",
  porta: "door",
  janela: "window",
  sorri: "smile",
  cantar: "sing",
  pausa: "break",
  café: "coffee",
  longe: "far",
  destino: "destination",
  chegamos: "arrived",
  leio: "read",
  ler: "read",
  fique: "stand",
  pé: "foot",
  olha: "look",
  atentamente: "attentively",
  profundamente: "deeply",
  cedo: "early",
  duro: "hard",
  pesado: "heavy",
  rápido: "quickly",
  certo: "correct",
  corretamente: "correctly",
  sorte: "luck",
  direção: "direction",
  reflexivo: "reflexive",
  novo: "again",
  logo: "soon",
  agorinha: "just now",
  baixo: "down",
  calor: "heat",
  volume: "volume",
};

const PT_PHRASE_EN = {
  "isso/isto": "that",
  "a casa": "the house",
  "o carro": "the car",
  "a comida": "the food",
  "lá fora": "outside",
  "o vestido": "the dress",
  "o filme": "the movie",
  "a pergunta": "the question",
  "a viagem": "the trip",
  "o caminho/estrada": "the road",
  "o caminho": "the road",
  "a rua": "the street",
  "o gato": "the cat",
  "a criança": "the child",
  "a resposta": "the answer",
  "o ônibus": "the bus",
  "o copo": "the glass",
  "a garrafa": "the bottle",
  "a bolsa/mala": "the bag",
  "ela/esta (objeto)": "it",
  "o quarto/sala": "the room",
  "a blusa/suéter": "the sweater",
  "a fruta": "the fruit",
  "o cachorro": "the dog",
  "a noite": "the evening",
  "o vizinho": "the neighbor",
  "o relógio": "the clock",
  "o país": "the country",
  "o homem": "the man",
  "a máquina": "the machine",
  "a piscina": "the pool",
  "o lago": "the lake",
  "o professor": "the teacher",
  "o sol": "the sun",
  "a chave": "the key",
  "a mão": "the hand",
  "a cama": "the bed",
  "o celular": "the phone",
  "o jornal": "the newspaper",
  "o trem": "the train",
  "o relógio/a hora": "the clock",
  "as crianças": "the children",
  "o quê": "what",
  "o nome": "the name",
  "a vida": "life",
  "a ajuda": "help",
  "o livro": "the book",
  "para cá": "here",
  "para fora": "outside",
  "para longe": "away",
  "para baixo": "down",
  "para cima/em pé": "up",
  "em/no/na": "on/in",
  "sobre/por": "about/for",
  "sobre/se": "about/if",
  "me/mim": "me",
  "te/ti": "you",
  "você (obj.)": "you",
  "eles/elas (obj.)": "them",
  "vai dar tudo certo": "will be fine",
  "você está?": "are you?",
  "no destino/chegamos": "at the destination",
  "fique de pé": "stand",
  "café com pausa": "coffee break",
  "certo/correto": "correct",
  "pronto/terminado": "ready",
  "duro/pesado": "hard",
  "por muito tempo": "for a long time",
  "muito tempo": "a long time",
  "de novo": "again",
  "em direção a": "towards",
  "o som": "the sound",
  "o quadro": "the painting",
  "o jogo/partida": "the match",
  "o prêmio": "the prize",
  "a conta (rest.)": "the bill",
  "o pacote": "the package",
  "a porta": "the door",
  "a janela": "the window",
  "a comida": "the food",
  "o país": "the country",
  "carta/baralho": "cards",
  "cartas/baralho": "cards",
  "alto (volume)": "loudly",
};

function extrasKey(swedish) {
  return swedish.trim().toLowerCase();
}

function enFromPtGloss(pt) {
  const first = pt.split("/")[0].trim();
  const lower = first.toLowerCase();
  if (PT_PHRASE_EN[lower]) return PT_PHRASE_EN[lower];
  if (PT_PHRASE_EN[pt.toLowerCase()]) return PT_PHRASE_EN[pt.toLowerCase()];

  const words = lower.split(/\s+/);
  const translated = words.map((w) => PT_WORD_EN[w] || null);
  if (translated.every(Boolean)) return translated.join(" ");
  return null;
}

function collectAllExtras(contents) {
  const map = new Map();
  for (const content of contents) {
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("Português,")) continue;
      const cols = line.split(",");
      const extrasRaw =
        cols.length >= 6 ? cols.slice(5).join(",") : cols.slice(3).join(",");
      for (const extra of parseExtras(extrasRaw)) {
        map.set(extrasKey(extra.swedish), extra.pt);
      }
    }
  }
  return map;
}

function buildExtrasEnMap(extrasPtMap) {
  const enMap = new Map();
  for (const [sv, pt] of extrasPtMap) {
    const en = enFromPtGloss(pt);
    if (en) enMap.set(sv, en);
  }
  return enMap;
}

const COMMON_WORDS = {
  jag: { en: "I", pt: "eu" },
  du: { en: "you", pt: "você" },
  han: { en: "he", pt: "ele" },
  hon: { en: "she", pt: "ela" },
  vi: { en: "we", pt: "nós" },
  ni: { en: "you (pl.)", pt: "vocês" },
  de: { en: "they", pt: "eles" },
  det: { en: "it/that", pt: "isso" },
  den: { en: "it/that", pt: "ele/ela (obj.)" },
  en: { en: "a/an", pt: "um/uma" },
  ett: { en: "a/an", pt: "um/uma" },
  är: { en: "is/are", pt: "é/está" },
  var: { en: "was", pt: "era/estava" },
  har: { en: "has/have", pt: "tem" },
  hade: { en: "had", pt: "tinha" },
  kan: { en: "can", pt: "pode" },
  ska: { en: "will/shall", pt: "vai" },
  och: { en: "and", pt: "e" },
  i: { en: "in", pt: "em" },
  på: { en: "on", pt: "em/no/na" },
  med: { en: "with", pt: "com" },
  till: { en: "to", pt: "para" },
  från: { en: "from", pt: "de" },
  om: { en: "about/if", pt: "sobre/se" },
  inte: { en: "not", pt: "não" },
  vad: { en: "what", pt: "o quê" },
  vem: { en: "who", pt: "quem" },
  hur: { en: "how", pt: "como" },
  när: { en: "when", pt: "quando" },
  varför: { en: "why", pt: "porquê" },
  här: { en: "here", pt: "aqui" },
  där: { en: "there", pt: "lá" },
  nu: { en: "now", pt: "agora" },
  idag: { en: "today", pt: "hoje" },
  igår: { en: "yesterday", pt: "ontem" },
  imorgon: { en: "tomorrow", pt: "amanhã" },
  ikväll: { en: "tonight", pt: "esta noite" },
  inatt: { en: "tonight", pt: "esta noite" },
  imorse: { en: "this morning", pt: "esta manhã" },
  mycket: { en: "much/very", pt: "muito" },
  bra: { en: "good", pt: "bom" },
  hjälp: { en: "help", pt: "ajuda" },
  kött: { en: "meat", pt: "carne" },
  fisk: { en: "fish", pt: "peixe" },
  tack: { en: "thanks", pt: "obrigado" },
  nej: { en: "no", pt: "não" },
  tid: { en: "time", pt: "tempo" },
  mat: { en: "food", pt: "comida" },
  ut: { en: "out", pt: "fora" },
  solen: { en: "the sun", pt: "o sol" },
  allt: { en: "everything", pt: "tudo" },
  glass: { en: "ice cream", pt: "sorvete" },
  vatten: { en: "water", pt: "água" },
  bröd: { en: "bread", pt: "pão" },
  brev: { en: "letter", pt: "carta" },
  guld: { en: "gold", pt: "ouro" },
  pengar: { en: "money", pt: "dinheiro" },
  lycka: { en: "happiness", pt: "felicidade" },
  tur: { en: "luck", pt: "sorte" },
  sant: { en: "true", pt: "verdade" },
  klar: { en: "ready", pt: "pronto" },
  hem: { en: "home", pt: "casa" },
  hit: { en: "here", pt: "para cá" },
  bort: { en: "away", pt: "para longe" },
  ner: { en: "down", pt: "para baixo" },
  upp: { en: "up", pt: "para cima" },
  mig: { en: "me", pt: "me/mim" },
  dig: { en: "you", pt: "te/ti" },
  dem: { en: "them", pt: "eles/elas" },
  honom: { en: "him", pt: "ele" },
  sig: { en: "oneself", pt: "se" },
  mot: { en: "towards", pt: "em direção a" },
  igen: { en: "again", pt: "de novo" },
  nyss: { en: "just now", pt: "agorinha" },
  fort: { en: "fast", pt: "depressa" },
  högt: { en: "loudly", pt: "alto" },
  högt: { en: "loudly", pt: "alto (volume)" },
  snabbt: { en: "quickly", pt: "rápido" },
  tidigt: { en: "early", pt: "cedo" },
  hårt: { en: "hard", pt: "duro" },
  länge: { en: "long", pt: "muito tempo" },
  djupt: { en: "deeply", pt: "profundamente" },
  noga: { en: "carefully", pt: "atentamente" },
  rätt: { en: "right", pt: "certo" },
  kallt: { en: "cold", pt: "frio" },
  varmt: { en: "warm", pt: "quente" },
  dyrt: { en: "expensive", pt: "caro" },
  glad: { en: "happy", pt: "feliz" },
  trött: { en: "tired", pt: "cansado" },
  ensam: { en: "alone", pt: "sozinho" },
  sjunga: { en: "sing", pt: "cantar" },
  fika: { en: "coffee break", pt: "café com pausa" },
  skratt: { en: "laughter", pt: "riso" },
  kyla: { en: "cold", pt: "frio" },
};

let globalExtrasPt = new Map();
let globalExtrasEn = new Map();

function tokenize(sentence) {
  return sentence
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/^["'(]+|["')]+$/g, ""))
    .filter(Boolean);
}

function normalizeToken(token) {
  return token.toLowerCase().replace(/[.!?,?…]+$/, "");
}

function isEntryForm(key, entryLemma, entryForms) {
  if (key === normalizeToken(entryLemma)) return true;
  if (isInflectedFormOfLemma(key, entryLemma)) return true;
  return entryForms?.some((f) => normalizeToken(f) === key) ?? false;
}

/**
 * Common Swedish adjective/adverb inflections relative to the citation lemma.
 */
function isInflectedFormOfLemma(surface, lemma) {
  const s = normalizeToken(surface);
  const l = normalizeToken(lemma);
  if (!s || !l) return false;
  if (s === l) return true;

  if (l.endsWith("ig")) {
    const stem = l.slice(0, -2);
    if (s === stem + "igt" || s === stem + "iga" || s === stem + "ige") {
      return true;
    }
  }

  if (l.endsWith("isk")) {
    const stem = l.slice(0, -3);
    if (s === stem + "iskt" || s === stem + "iska" || s === stem + "iske") {
      return true;
    }
  }

  if (l.endsWith("lig")) {
    const stem = l.slice(0, -3);
    if (s === stem + "ligt" || s === stem + "liga" || s === stem + "lige") {
      return true;
    }
  }

  if (l.endsWith("sam")) {
    const stem = l.slice(0, -3);
    if (s === stem + "samt" || s === stem + "sama") return true;
  }

  if (l.endsWith("en") && l.length > 3) {
    const stem = l.slice(0, -2);
    if (s === stem + "et" || s === stem + "na" || s === stem + "ne") {
      return true;
    }
  }

  if (l.endsWith("or") && l.length > 3) {
    const stem = l.slice(0, -2);
    if (s === stem + "ort" || s === stem + "ora") return true;
  }

  if (l.endsWith("ad")) {
    const stem = l.slice(0, -2);
    if (s === stem + "at" || s === stem + "ade" || s === stem + "ada") {
      return true;
    }
  }

  if (s === l + "t" || s === l + "a" || s === l + "e") return true;

  return false;
}

const MODAL_AUXILIARIES = new Set([
  "ska",
  "skulle",
  "kommer",
  "kom",
  "har",
  "hade",
  "kan",
  "kunde",
  "måste",
  "bör",
  "vill",
  "ville",
  "får",
  "fick",
]);

/** Infinitive lemma -> attested conjugated forms (incl. irregular modals). */
const MODAL_INFINITIVE_FORMS = new Map([
  ["kunna", ["kan", "kunde"]],
  ["ha", ["har", "hade"]],
  ["få", ["får", "fick"]],
  ["vilja", ["vill", "ville"]],
  ["komma", ["kommer", "kom"]],
  ["skola", ["ska", "skulle"]],
  ["måste", ["måste"]],
  ["böra", ["bör", "borde"]],
]);

function lemmaCandidates(lemma) {
  const norm = normalizeToken(lemma);
  const first = norm.split(/\s+/)[0];
  return first === norm ? [norm] : [norm, first];
}

function modalFormsForLemma(lemma) {
  const forms = new Set();
  for (const candidate of lemmaCandidates(lemma)) {
    for (const form of MODAL_INFINITIVE_FORMS.get(candidate) || []) {
      forms.add(form);
    }
  }
  return [...forms];
}

function isModalFormOfLemma(form, lemma) {
  const key = normalizeToken(form);
  return modalFormsForLemma(lemma).includes(key);
}

const PRONOUNS_AND_DETERMINERS = new Set([
  "jag",
  "du",
  "han",
  "hon",
  "vi",
  "ni",
  "de",
  "det",
  "den",
  "en",
  "ett",
  "mig",
  "dig",
  "dem",
  "honom",
  "henne",
  "sig",
  "min",
  "din",
  "sin",
  "vår",
  "er",
  "deras",
]);

const COMMON_SENTENCE_ADVERBS = new Set([
  "inte",
  "aldrig",
  "alltid",
  "ofta",
  "ibland",
  "nu",
  "idag",
  "igår",
  "imorgon",
  "snart",
  "här",
  "där",
  "hem",
  "hit",
  "bort",
  "ner",
  "upp",
  "redan",
  "fortfarande",
  "kanske",
  "bara",
  "också",
  "mycket",
]);

const TO_BE_EN_FORMS = new Set([
  "be",
  "is",
  "are",
  "was",
  "were",
  "am",
  "been",
  "being",
]);

function verbStems(infinitive) {
  const norm = normalizeToken(infinitive);
  const stems = new Set([norm]);
  if (norm.endsWith("as")) stems.add(norm.slice(0, -2));
  if (norm.endsWith("a")) stems.add(norm.slice(0, -1));
  return stems;
}

function matchesVerbStem(tokenKey, infinitive) {
  const infNorm = normalizeToken(infinitive);
  if (tokenKey === infNorm) return true;
  for (const stem of verbStems(infinitive)) {
    if (stem.length < 2) continue;
    if (tokenKey === stem) return true;
    if (tokenKey.startsWith(stem) && tokenKey.length <= stem.length + 5) return true;
  }
  return false;
}

const EN_MODAL_GLOSS_LINKS = [
  { tokens: ["can", "could"], entries: ["to be able to", "be able to"] },
  { tokens: ["have", "has", "had", "having"], entries: ["to have"] },
  { tokens: ["want", "wanted"], entries: ["to want"] },
  { tokens: ["come", "comes", "came"], entries: ["to come"] },
  { tokens: ["must"], entries: ["must", "have to"] },
  { tokens: ["will", "would", "shall", "should"], entries: ["shall", "will", "should"] },
  { tokens: ["may", "might"], entries: ["may", "be allowed", "to receive", "to get"] },
];

function verbTranslationsRelated(tokenEn, entryEn) {
  const token = shortLabel(tokenEn, "en").toLowerCase();
  const entry = (entryEn || "").toLowerCase();
  if (!token || token === "—" || !entry) return false;
  if (entry.includes("to be") && TO_BE_EN_FORMS.has(token.split("/")[0].trim())) {
    return true;
  }
  for (const link of EN_MODAL_GLOSS_LINKS) {
    if (
      link.tokens.includes(token) &&
      link.entries.some((needle) => entry.includes(needle))
    ) {
      return true;
    }
  }
  if (!entry.startsWith("to ")) return false;
  const root = entry
    .slice(3)
    .split("/")[0]
    .trim()
    .replace(/\s+\(.+\)$/, "");
  if (!root) return false;
  return (
    token === root ||
    token === `${root}s` ||
    token === `${root}ed` ||
    token === `${root}ing` ||
    token.startsWith(root)
  );
}

function tokenLinksToEntry(token, entryTranslations, infinitive) {
  const tokenEn = token.translations?.en || "";
  const tokenPt = token.translations?.pt || "";
  const entryEn = entryTranslations.en || "";
  const entryPt = cleanPtLabel(entryTranslations.pt || "");

  if (verbTranslationsRelated(tokenEn, entryEn)) return true;

  const tokenPtFirst = tokenPt.split("/")[0].trim();
  if (
    entryPt &&
    tokenPtFirst &&
    tokenPtFirst !== "—" &&
    (entryPt.toLowerCase().includes(tokenPtFirst.toLowerCase()) ||
      tokenPtFirst.toLowerCase().includes(entryPt.toLowerCase().split("/")[0]))
  ) {
    return true;
  }

  return matchesVerbStem(normalizeToken(token.swedish), infinitive);
}

function shouldSkipAsVerbForm(key, infinitive) {
  if (key === normalizeToken(infinitive)) return false;
  if (isModalFormOfLemma(key, infinitive)) return false;
  if (MODAL_AUXILIARIES.has(key)) return true;
  if (PRONOUNS_AND_DETERMINERS.has(key)) return true;
  if (COMMON_SENTENCE_ADVERBS.has(key)) return true;
  return false;
}

function tokenBelongsToVerbEntry(token, infinitive, entryTranslations) {
  const key = normalizeToken(token.swedish);
  if (!key) return false;
  if (key === normalizeToken(infinitive)) return true;
  if (isModalFormOfLemma(key, infinitive)) return true;
  if (matchesVerbStem(key, infinitive)) return true;
  if (tokenLinksToEntry(token, entryTranslations, infinitive)) return true;
  return normalizeToken(token.lemma) === normalizeToken(infinitive);
}

function isGlossedNonVerbToken(token, entryTranslations, infinitive) {
  const key = normalizeToken(token.swedish);
  if (!key || shouldSkipAsVerbForm(key, infinitive)) return false;
  if (matchesVerbStem(key, infinitive)) return false;
  if (tokenLinksToEntry(token, entryTranslations, infinitive)) return false;
  const en = token.translations?.en;
  const pt = token.translations?.pt;
  return Boolean(
    (en && en !== "—") || (pt && pt !== "—" && !PRONOUNS_AND_DETERMINERS.has(key))
  );
}

function collectLemmaMatchingForms(lemma, tokens) {
  const lemmaNorm = normalizeToken(lemma);
  const forms = new Set([lemmaNorm]);
  for (const token of tokens) {
    const key = normalizeToken(token.swedish);
    if (!key) continue;
    const tokenLemma = normalizeToken(token.lemma || token.swedish);
    if (
      tokenLemma === lemmaNorm ||
      key === lemmaNorm ||
      isInflectedFormOfLemma(key, lemma)
    ) {
      forms.add(key);
    }
  }
  return [...forms];
}

function extractVerbFormsFromTokens(infinitive, tokens, entryTranslations) {
  const forms = new Set([normalizeToken(infinitive)]);
  for (const token of tokens) {
    const key = normalizeToken(token.swedish);
    if (!key) continue;
    if (tokenBelongsToVerbEntry(token, infinitive, entryTranslations)) {
      forms.add(key);
      continue;
    }
    if (shouldSkipAsVerbForm(key, infinitive)) continue;
    if (isGlossedNonVerbToken(token, entryTranslations, infinitive)) continue;
    if (matchesVerbStem(key, infinitive)) {
      forms.add(key);
      continue;
    }
    if (tokenLinksToEntry(token, entryTranslations, infinitive)) {
      forms.add(key);
      continue;
    }
    if (normalizeToken(token.lemma) === normalizeToken(infinitive)) {
      forms.add(key);
    }
  }
  return [...forms];
}

function keepExplicitForm(form, lemma, tokens, type, entryTranslations, infinitive) {
  const key = normalizeToken(form);
  if (!key) return false;
  if (type === "verb") {
    if (key === normalizeToken(infinitive)) return true;
    if (isModalFormOfLemma(key, infinitive)) return true;
    const token = tokens.find((t) => normalizeToken(t.swedish) === key);
    if (!token) return false;
    if (shouldSkipAsVerbForm(key, infinitive)) return false;
    if (isGlossedNonVerbToken(token, entryTranslations, infinitive)) return false;
    return (
      matchesVerbStem(key, infinitive) ||
      tokenLinksToEntry(token, entryTranslations, infinitive) ||
      normalizeToken(token.lemma) === normalizeToken(infinitive)
    );
  }
  if (type === "adjective" || type === "adverb") {
    const lemmaNorm = normalizeToken(lemma);
    if (key === lemmaNorm) return true;
    return tokens.some((t) => {
      const tk = normalizeToken(t.swedish);
      return (
        tk === key &&
        (normalizeToken(t.lemma) === lemmaNorm || tk === lemmaNorm)
      );
    });
  }
  return key === normalizeToken(lemma);
}

function deriveEntryForms(entry) {
  const lemma = entry.swedish || entry.lemma;
  const tokens = (entry.examples || []).flatMap((ex) => ex.tokens || []);
  const explicit = entry.forms || [];
  const translations = entry.translations || { en: "—", pt: "—" };

  let derived;
  if (entry.type === "verb") {
    derived = extractVerbFormsFromTokens(lemma, tokens, translations);
  } else if (entry.type === "adjective" || entry.type === "adverb") {
    derived = collectLemmaMatchingForms(lemma, tokens);
  } else {
    derived = [normalizeToken(lemma)];
  }

  const forms = new Set(derived);
  for (const form of explicit) {
    if (keepExplicitForm(form, lemma, tokens, entry.type, translations, lemma)) {
      forms.add(normalizeToken(form));
    }
  }

  if (entry.type === "verb") {
    for (const form of modalFormsForLemma(lemma)) {
      forms.add(form);
    }
  }

  return forms.size ? [...forms] : [normalizeToken(lemma)];
}

function shortLabel(text, lang) {
  if (!text || text === "—") return text;
  const first = text.split("/")[0].trim();
  if (lang === "en") return first.replace(/^to\s+/i, "");
  if (lang === "pt") return first.toLowerCase();
  return first;
}

function resolveTokenTranslations(
  key,
  localExtrasPt,
  entryLemma,
  entryTranslations,
  entryForms
) {
  const common = COMMON_WORDS[key];
  const extraPt = localExtrasPt.get(key) || globalExtrasPt.get(key);
  const extraEn = globalExtrasEn.get(key);
  const isForm = isEntryForm(key, entryLemma, entryForms);

  let pt = extraPt || common?.pt || (isForm ? entryTranslations.pt : null);
  let en =
    common?.en ||
    extraEn ||
    (isForm ? entryTranslations.en : null) ||
    (extraPt ? enFromPtGloss(extraPt) : null);

  if (isForm) {
    en = shortLabel(en, "en");
    pt = shortLabel(pt, "pt");
  } else {
    en = shortLabel(en, "en");
    pt = shortLabel(pt, "pt");
  }

  if (dictionariesAvailable() && (en === "—" || pt === "—")) {
    if (en === "—") {
      const fromDict = lookupSvEn(key);
      if (fromDict) en = shortLabel(fromDict, "en");
    }
    if (pt === "—") {
      const fromDict = lookupSvPt(key);
      if (fromDict) pt = shortLabel(fromDict, "pt");
    }
  }

  return {
    en: en || "—",
    pt: pt || "—",
  };
}

function enrichTokensFromDictionary(tokens, entryContext = null, options = {}) {
  if (!tokens?.length) return tokens;
  const { force = false } = options;

  const localExtrasPt = new Map();

  for (const token of tokens) {
    const key = normalizeToken(token.swedish);
    if (!key) continue;

    const resolved = resolveTokenTranslations(
      key,
      localExtrasPt,
      entryContext?.entryLemma || "",
      entryContext?.entryTranslations || { en: "—", pt: "—" },
      entryContext?.entryForms || []
    );

    const needsEn =
      force || !token.translations?.en || token.translations.en === "—";
    const needsPt =
      force || !token.translations?.pt || token.translations.pt === "—";

    if (needsEn && resolved.en !== "—") {
      token.translations.en = resolved.en;
    }
    if (needsPt && resolved.pt !== "—") {
      token.translations.pt = resolved.pt;
    }

    const entryLemma = entryContext?.entryLemma;
    if (entryLemma && isInflectedFormOfLemma(key, entryLemma)) {
      token.lemma = normalizeToken(entryLemma);
    } else if (dictionariesAvailable()) {
      const dictLemma = lookupSvLemma(key);
      if (dictLemma) token.lemma = dictLemma;
    }
  }

  return tokens;
}

function buildTokens(
  sentence,
  extras,
  entryLemma,
  entryTranslations,
  entryForms = []
) {
  const rawTokens = tokenize(sentence);
  const localExtrasPt = new Map();
  for (const e of extras) {
    localExtrasPt.set(extrasKey(e.swedish), e.pt);
  }

  return rawTokens.map((word) => {
    const key = normalizeToken(word);
    const translations = resolveTokenTranslations(
      key,
      localExtrasPt,
      entryLemma,
      entryTranslations,
      entryForms
    );
    const lemma =
      key === normalizeToken(entryLemma) || isInflectedFormOfLemma(key, entryLemma)
        ? entryLemma.toLowerCase()
        : key;
    return { swedish: word, lemma, translations };
  });
}

function glossFromTokens(tokens, lang) {
  const contentTokens = tokens.filter((t) => normalizeToken(t.swedish));
  if (!contentTokens.length) return "";

  const parts = [];
  for (const t of contentTokens) {
    const tr = t.translations[lang];
    if (tr && tr !== "—") parts.push(tr);
  }

  if (parts.length < Math.ceil(contentTokens.length * 0.5)) return "";
  return parts.join(" ");
}

function parseCsvLines(content) {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("Português,"));
}

function readSourceFile(sourceDir, name) {
  const filePath = path.join(sourceDir, name);
  return fs.readFileSync(filePath, "utf8");
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

function escapeCsvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function serializeTokens(tokens) {
  if (!tokens?.length) return "";
  return tokens
    .map((t) =>
      [
        t.swedish,
        t.lemma || normalizeToken(t.swedish),
        t.translations?.en || "",
        t.translations?.pt || "",
      ].join("|")
    )
    .join(";");
}

function deserializeTokens(raw) {
  if (!raw?.trim()) return [];
  return raw.split(";").map((part) => {
    const [swedish, lemma, en, pt] = part.split("|");
    return {
      swedish: swedish || "",
      lemma: lemma || normalizeToken(swedish || ""),
      translations: { en: en || "—", pt: pt || "—" },
    };
  });
}

function entryToCsvRow(entry) {
  const row = {
    id: entry.id || "",
    lemma: entry.swedish || entry.lemma,
    type: entry.type,
    english: entry.translations?.en || "",
    portuguese: entry.translations?.pt || "",
    forms: (entry.forms || []).join(";"),
    cefr: entry.cefr || "",
    frequency: entry.frequency ?? "",
    wpm: entry.wpm ?? "",
    source: entry.source || "practice",
    usage_note: entry.usageNote || "",
  };

  for (let i = 0; i < 3; i++) {
    const ex = entry.examples?.[i];
    const n = i + 1;
    row[`ex${n}_sv`] = ex?.swedish || "";
    row[`ex${n}_en`] = ex?.translations?.en || "";
    row[`ex${n}_pt`] = ex?.translations?.pt || "";
    row[`ex${n}_tense`] = ex?.tense || "";
    row[`ex${n}_tokens`] = serializeTokens(ex?.tokens);
  }

  return VOCABULARY_COLUMNS.map((col) => escapeCsvField(row[col] ?? "")).join(",");
}

function writeUnifiedCsv(filePath, entries) {
  const docRow = VOCABULARY_COLUMNS.map((col) => {
    const docs = {
      id: "stable entry ID (do not change if users may have marked as known)",
      lemma: "Swedish word (lemma)",
      type: "verb | adjective | adverb | noun | numeral | etc.",
      english: "English translation",
      portuguese: "Brazilian Portuguese translation",
      forms: "semicolon-separated inflected forms for search",
      cefr: "optional CEFR level (A1–C2)",
      frequency: "optional raw corpus frequency (Kelly)",
      wpm: "optional words-per-million frequency (Kelly)",
      source: "practice | kelly | manual",
      ex1_sv: "example 1 Swedish sentence",
      ex1_en: "example 1 English gloss",
      ex1_pt: "example 1 Portuguese gloss",
      ex1_tense: "optional: past | present | future",
      ex1_tokens: "optional tokens: word|lemma|en|pt;word2|lemma2|en2|pt2",
      ex2_sv: "example 2 Swedish (verbs: present tense)",
      ex2_en: "example 2 English",
      ex2_pt: "example 2 Portuguese",
      ex2_tense: "example 2 tense key",
      ex2_tokens: "example 2 token breakdown",
      ex3_sv: "example 3 Swedish (verbs: future tense)",
      ex3_en: "example 3 English",
      ex3_pt: "example 3 Portuguese",
      ex3_tense: "example 3 tense key",
      ex3_tokens: "example 3 token breakdown",
      usage_note: "optional usage note (Kelly source text)",
    };
    return escapeCsvField(`# ${docs[col] || col}`);
  }).join(",");

  const header = VOCABULARY_COLUMNS.join(",");
  const lines = [docRow, header, ...entries.map(entryToCsvRow)];
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
}

function rowToObject(headers, values) {
  const row = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = (values[i] || "").trim();
  }
  return row;
}

function csvRowToEntry(row, index) {
  const lemma = row.lemma;
  const type = row.type;
  if (!lemma || !type) return null;

  const translations = {
    en: row.english || "—",
    pt: row.portuguese || "—",
  };

  const fromDict = lookupTranslations(lemma, {
    en: translations.en !== "—" ? translations.en : null,
    pt: translations.pt !== "—" ? translations.pt : null,
  });
  if (fromDict.en && translations.en === "—") translations.en = fromDict.en;
  if (fromDict.pt && translations.pt === "—") translations.pt = fromDict.pt;
  const explicitForms = row.forms
    ? row.forms.split(";").map((f) => f.trim()).filter(Boolean)
    : [];
  const formsSeed = explicitForms.length
    ? explicitForms
    : [lemma.toLowerCase()];

  const source = row.source || "practice";
  const baseId =
    row.id ||
    (source === "kelly"
      ? `kelly-${index}-${slugify(lemma)}`
      : `${type}-${slugify(lemma)}`);

  const examples = [];
  for (let i = 1; i <= 3; i++) {
    const sv = row[`ex${i}_sv`];
    if (!sv) continue;

    let tokens = deserializeTokens(row[`ex${i}_tokens`]);
    const tokenContext = {
      entryLemma: lemma,
      entryTranslations: translations,
      entryForms: formsSeed,
    };
    if (!tokens.length) {
      tokens = buildTokens(sv, [], lemma, translations, formsSeed);
    } else {
      enrichTokensFromDictionary(tokens, tokenContext);
    }

    const glossEn = glossFromTokens(tokens, "en");
    const glossPt = glossFromTokens(tokens, "pt");
    const storedEn = (row[`ex${i}_en`] || "").trim();
    const storedPt = (row[`ex${i}_pt`] || "").trim();

    const ex = {
      id: `${baseId}-ex${examples.length + 1}`,
      swedish: sv,
      translations: {
        en: storedEn || glossEn || "",
        pt: storedPt || glossPt || "",
      },
      tokens,
    };

    const tense = row[`ex${i}_tense`];
    if (tense) {
      ex.tense = tense;
      ex.tenseLabel = TENSE_LABELS[tense] || { en: tense, pt: tense };
    }

    examples.push(ex);
  }

  const entry = {
    id: baseId,
    lemma: lemma.toLowerCase(),
    type,
    swedish: lemma,
    forms: explicitForms.length ? explicitForms : [lemma.toLowerCase()],
    translations,
    examples,
  };

  if (row.cefr) entry.cefr = row.cefr;
  if (row.frequency) {
    const freq = parseKellyNumber(row.frequency);
    if (freq > 0) entry.frequency = freq;
  }
  if (row.wpm) {
    const wpm = parseKellyNumber(row.wpm);
    if (wpm > 0) entry.wpm = wpm;
  }
  if (source) entry.source = source;
  if (row.usage_note) entry.usageNote = row.usage_note;

  entry.forms = deriveEntryForms(entry);

  return entry;
}

function parseUnifiedCsv(content) {
  const rows = parseCsv(content).filter((row) => {
    const first = (row[0] || "").trim();
    return first && !first.startsWith("#");
  });
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  const entries = [];
  const seenIds = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rowToObject(headers, rows[i]);
    const entry = csvRowToEntry(row, i);
    if (!entry) continue;

    if (seenIds.has(entry.id)) {
      let suffix = 2;
      while (seenIds.has(`${entry.id}-${suffix}`)) suffix++;
      entry.id = `${entry.id}-${suffix}`;
      for (const ex of entry.examples) {
        ex.id = ex.id.replace(/-ex\d+$/, `-ex${ex.id.match(/-ex(\d+)$/)?.[1] || "1"}`);
      }
    }
    seenIds.set(entry.id, true);

    entries.push(entry);
  }

  return entries;
}

function loadLegacyPracticeEntries(sourceDir) {
  const adjContent = readSourceFile(sourceDir, "Swedish Vocabulary Practice - Adjetivos.csv");
  const advContent = readSourceFile(sourceDir, "Swedish Vocabulary Practice - Advérbios.csv");
  const verbContent = readSourceFile(sourceDir, "Swedish Vocabulary Practice - Verbos.csv");

  globalExtrasPt = collectAllExtras([adjContent, advContent, verbContent]);
  globalExtrasEn = buildExtrasEnMap(globalExtrasPt);

  const adjectives = parseAdjAdvCsv(adjContent, "adjective");
  const adverbs = parseAdjAdvCsv(advContent, "adverb");
  const verbs = parseVerbsCsv(verbContent);

  for (const entry of [...adjectives, ...adverbs, ...verbs]) {
    entry.source = "practice";
  }

  return { adjectives, adverbs, verbs, practiceEntries: [...adjectives, ...adverbs, ...verbs] };
}

function parseAdjAdvCsv(content, type) {
  const entries = [];
  const lines = parseCsvLines(content);
  const seen = new Map();

  for (const line of lines) {
    const cols = line.split(",");
    if (cols.length < 4) continue;
    const ptRaw = cols[0];
    const swedish = cols[1].trim();
    const sentence = cols[2].trim();
    const extrasRaw = cols.slice(3).join(",").trim();
    const extras = parseExtras(extrasRaw);
    const pt = cleanPtLabel(ptRaw);
    const en = toEn(ptRaw);

    let baseId = `${type}-${slugify(swedish)}`;
    const count = seen.get(baseId) || 0;
    seen.set(baseId, count + 1);
    const id = count > 0 ? `${baseId}-${count + 1}` : baseId;

    const translations = { en, pt };
    const tokens = buildTokens(sentence, extras, swedish, translations, [swedish]);
    const forms = collectLemmaMatchingForms(swedish, tokens);

    entries.push({
      id,
      lemma: swedish.toLowerCase(),
      type,
      swedish,
      forms: forms,
      translations,
      examples: [
        {
          id: `${id}-ex1`,
          swedish: sentence,
          translations: {
            en: glossFromTokens(tokens, "en"),
            pt: glossFromTokens(tokens, "pt"),
          },
          tokens,
        },
      ],
    });
  }
  return entries;
}

function parseVerbsCsv(content) {
  const entries = [];
  const lines = parseCsvLines(content);

  for (const line of lines) {
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        parts.push(current);
        current = "";
      } else current += ch;
    }
    parts.push(current);

    if (parts.length < 6) continue;

    const ptRaw = parts[0];
    const infinitive = parts[1].trim();
    const past = parts[2].trim();
    const present = parts[3].trim();
    const future = parts[4].trim();
    const extrasRaw = parts[5].trim();
    const extras = parseExtras(extrasRaw);
    const pt = cleanPtLabel(ptRaw);
    const en = toEn(ptRaw);
    const id = `verb-${slugify(infinitive)}`;
    const translations = { en, pt };
    const formsSeed = new Set([infinitive.toLowerCase()]);
    for (const sentence of [past, present, future]) {
      for (const token of tokenize(sentence)) {
        const f = normalizeToken(token);
        if (f) formsSeed.add(f);
      }
    }
    const formsArray = [...formsSeed];

    const tenseExamples = [
      { key: "past", swedish: past, label: { en: "Past", pt: "Passado" } },
      { key: "present", swedish: present, label: { en: "Present", pt: "Presente" } },
      { key: "future", swedish: future, label: { en: "Future", pt: "Futuro" } },
    ];

    const examples = tenseExamples.map((t, i) => {
      const tokens = buildTokens(t.swedish, extras, infinitive, translations, formsArray);
      return {
        id: `${id}-ex${i + 1}`,
        tense: t.key,
        tenseLabel: t.label,
        swedish: t.swedish,
        translations: {
          en: glossFromTokens(tokens, "en"),
          pt: glossFromTokens(tokens, "pt"),
        },
        tokens,
      };
    });

    const forms = extractVerbFormsFromTokens(
      infinitive,
      examples.flatMap((ex) => ex.tokens),
      translations
    );

    entries.push({
      id,
      lemma: infinitive.toLowerCase(),
      type: "verb",
      swedish: infinitive,
      forms: forms.filter(Boolean),
      translations,
      examples,
    });
  }
  return entries;
}

function buildFormIndex(entries) {
  const index = {};
  for (const entry of entries) {
    for (const form of entry.forms) {
      const key = form.toLowerCase();
      if (!index[key]) index[key] = [];
      if (!index[key].includes(entry.id)) index[key].push(entry.id);
    }
    const lemma = entry.lemma.toLowerCase();
    if (!index[lemma]) index[lemma] = [];
    if (!index[lemma].includes(entry.id)) index[lemma].push(entry.id);
  }
  return index;
}

function countByType(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.type] = (counts[entry.type] || 0) + 1;
  }
  return counts;
}

function buildVocabularyData(entries, extraMeta = {}) {
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      counts: {
        ...countByType(entries),
        total: entries.length,
        ...extraMeta,
      },
    },
    entries,
    formIndex: buildFormIndex(entries),
  };
}

function mergeCachedExampleTokens(example, cachedTokens) {
  if (!cachedTokens?.length || !example.tokens?.length) return 0;

  const lookup = new Map();
  for (const t of cachedTokens) {
    const sv = t.sv || t.swedish;
    if (!sv) continue;
    lookup.set(sv.toLowerCase(), t);
    lookup.set(normalizeToken(sv), t);
  }

  let merged = 0;
  for (const token of example.tokens) {
    const cached =
      lookup.get(token.swedish.toLowerCase()) ||
      lookup.get(normalizeToken(token.swedish));
    if (!cached) continue;

    if (cached.en) token.translations.en = cached.en;
    if (cached.pt) token.translations.pt = cached.pt;
    if (cached.lemma) token.lemma = cached.lemma;
    merged++;
  }

  return merged;
}

function refreshExampleTokens(example, entryContext, options = {}) {
  if (!example?.swedish) return example;

  if (!example.tokens?.length) {
    example.tokens = buildTokens(
      example.swedish,
      [],
      entryContext.entryLemma,
      entryContext.entryTranslations,
      entryContext.entryForms
    );
  } else {
    enrichTokensFromDictionary(example.tokens, entryContext, options);
  }

  return example;
}

function applySentenceEnrichmentCache(entries, cachePath) {
  if (!cachePath || !fs.existsSync(cachePath)) return { sentences: 0, tokens: 0 };

  let cache;
  try {
    cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return { sentences: 0, tokens: 0 };
  }

  const completed = cache.completed || {};
  let sentences = 0;
  let tokens = 0;

  for (const entry of entries) {
    const cached = completed[entry.id];
    if (!cached?.examples?.length || !entry.examples?.length) continue;

    const entryContext = {
      entryLemma: entry.swedish || entry.lemma,
      entryTranslations: entry.translations || { en: "—", pt: "—" },
      entryForms: entry.forms || [],
    };

    for (const ex of entry.examples) {
      const cachedEx =
        cached.examples.find((c) => c.sv === ex.swedish) ||
        (ex.tense
          ? cached.examples.find((c) => c.tense === ex.tense)
          : null);
      if (!cachedEx) continue;

      if (cachedEx.en) ex.translations.en = cachedEx.en;
      if (cachedEx.pt) ex.translations.pt = cachedEx.pt;
      sentences++;

      if (cachedEx.tokens?.length) {
        tokens += mergeCachedExampleTokens(ex, cachedEx.tokens);
      } else {
        refreshExampleTokens(ex, entryContext, { force: true });
      }
    }
  }

  return { sentences, tokens };
}

module.exports = {
  VOCABULARY_COLUMNS,
  TENSE_LABELS,
  MOST_COMMON_PER_TYPE,
  applyMostCommonFlags,
  applySentenceEnrichmentCache,
  mergeCachedExampleTokens,
  refreshExampleTokens,
  mergeKellyMetadata,
  parseKellyNumber,
  rankFrequency,
  buildFormIndex,
  buildVocabularyData,
  buildTokens,
  collectAllExtras,
  buildExtrasEnMap,
  collectLemmaMatchingForms,
  csvRowToEntry,
  deriveEntryForms,
  deserializeTokens,
  entryToCsvRow,
  extractVerbFormsFromTokens,
  glossFromTokens,
  loadLegacyPracticeEntries,
  normalizeToken,
  parseUnifiedCsv,
  serializeTokens,
  slugify,
  writeUnifiedCsv,
  setGlobalExtras(ptMap, enMap) {
    globalExtrasPt = ptMap;
    globalExtrasEn = enMap;
  },
};
