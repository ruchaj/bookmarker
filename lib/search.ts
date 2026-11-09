// Full-text search over a book's passages, written from scratch so the app
// needs no database: tokenise, stem lightly, and rank with BM25.

const STOP_WORDS = new Set(
  `a about above after again against all am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have
having he her here hers herself him himself his how i if in into is it its itself just me more most
my myself no nor not now of off on once only or other our ours ourselves out over own same she should
so some such than that the their theirs them themselves then there these they this those through to
too under until up very was we were what when where which while who whom why will with would you
your yours yourself yourselves
remember remembered reading read last thing part bit scene chapter page book think something
someone somebody got get getting went going really maybe around happened happening`
    .split(/\s+/)
    .filter(Boolean),
);

/** Lower-cased words made only of letters and digits, accents removed. */
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[a-z0-9]+/g) ?? []
  );
}

/**
 * A small English stemmer: enough to match "letters" with "letter" and
 * "arrived" with "arriving". The same rule runs on the description and the
 * book, so the stems only need to agree with each other, not be real words.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (/(ch|sh|ss|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);

  const strip = (suffix: string, minStem: number) => {
    if (!w.endsWith(suffix) || w.length - suffix.length < minStem) return false;
    w = w.slice(0, -suffix.length);
    if (/([bdfgklmnprt])\1$/.test(w)) w = w.slice(0, -1); // running -> run
    return true;
  };
  if (!strip("ing", 3)) strip("ed", 3);

  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

export interface SearchQuery {
  /** Stemmed words; a passage matching any of them is a candidate. */
  terms: string[];
  /** Stemmed word sequences (names, phrases) that score extra when they appear together. */
  phrases: string[][];
}

/** Build a query from the reader's description plus any extra terms (names, synonyms). */
export function buildQuery(description: string, extraTerms: string[] = []): SearchQuery {
  const terms = new Set<string>();
  const phrases = new Map<string, string[]>();

  for (const w of words(description)) {
    if (w.length > 2 && !STOP_WORDS.has(w)) terms.add(stem(w));
  }

  for (const term of extraTerms.slice(0, 40)) {
    const ws = words(term).filter((w) => w.length > 1);
    const meaningful = ws.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of meaningful) terms.add(stem(w));
    if (ws.length > 1 && ws.length <= 4 && meaningful.length === ws.length) {
      const stems = ws.map(stem);
      phrases.set(stems.join(" "), stems);
    }
  }

  return { terms: [...terms].slice(0, 60), phrases: [...phrases.values()].slice(0, 20) };
}

/**
 * Build a PostgreSQL tsquery string for use with to_tsquery('english', ...).
 * Single-word terms are ORed; multi-word extra terms are added as phrases with <->.
 */
export function buildTsQuery(description: string, extraTerms: string[] = []): string {
  const parts: string[] = [];

  for (const w of words(description)) {
    if (w.length > 2 && !STOP_WORDS.has(w)) parts.push(w);
  }

  for (const term of extraTerms.slice(0, 20)) {
    const ws = words(term).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
    if (ws.length === 0) continue;
    parts.push(ws.length === 1 ? ws[0] : `(${ws.join(" <-> ")})`);
  }

  const seen = new Set<string>();
  return parts.filter((p) => !seen.has(p) && seen.add(p)).join(" | ");
}

const K1 = 1.4;
const B = 0.75;

/** The passages that best match the query, best first. Passages matching nothing are left out. */
export function rankPassages<T extends { content: string }>(passages: T[], query: SearchQuery, limit = 20): T[] {
  if (query.terms.length === 0 || passages.length === 0) return [];
  const wanted = new Set(query.terms);

  const docs = passages.map((passage) => {
    const tokens = words(passage.content).map(stem);
    const counts = new Map<string, number>();
    for (const token of tokens) {
      if (wanted.has(token)) counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return { passage, tokens, counts };
  });

  const averageLength = docs.reduce((n, d) => n + d.tokens.length, 0) / docs.length || 1;
  const idf = new Map<string, number>();
  for (const term of wanted) {
    const containing = docs.reduce((n, d) => n + (d.counts.has(term) ? 1 : 0), 0);
    idf.set(term, Math.log(1 + (docs.length - containing + 0.5) / (containing + 0.5)));
  }

  const hasPhrase = (tokens: string[], phrase: string[]) => {
    for (let i = tokens.indexOf(phrase[0]); i !== -1; i = tokens.indexOf(phrase[0], i + 1)) {
      if (phrase.every((word, j) => tokens[i + j] === word)) return true;
    }
    return false;
  };

  return docs
    .map((doc, order) => {
      let score = 0;
      for (const [term, count] of doc.counts) {
        const length = 1 - B + (B * doc.tokens.length) / averageLength;
        score += (idf.get(term) ?? 0) * ((count * (K1 + 1)) / (count + K1 * length));
      }
      if (score > 0) {
        for (const phrase of query.phrases) {
          if (hasPhrase(doc.tokens, phrase)) {
            // Half again on top of the words' own scores: a bonus, not a second count.
            score += 0.5 * phrase.reduce((n, word) => n + (idf.get(word) ?? 0), 0);
          }
        }
      }
      return { doc, score, order };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((r) => r.doc.passage);
}
