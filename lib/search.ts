// Turns a reader's description (plus any extra search terms) into a
// PostgreSQL tsquery string for search_passages().

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

/** Lower-cased words made only of letters and digits, safe to place in a tsquery. */
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
 * Build an OR query. Single words match on their own; multi-word terms
 * (names, phrases) match as adjacent words and also word by word.
 */
export function buildTsQuery(description: string, extraTerms: string[] = []): string {
  const parts = new Set<string>();

  for (const w of words(description)) {
    if (w.length > 2 && !STOP_WORDS.has(w)) parts.add(w);
  }

  for (const term of extraTerms.slice(0, 40)) {
    const ws = words(term).filter((w) => w.length > 1);
    if (ws.length === 0) continue;
    const meaningful = ws.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of meaningful) parts.add(w);
    if (ws.length > 1 && ws.length <= 4 && meaningful.length === ws.length) {
      parts.add(`(${ws.join(" <-> ")})`);
    }
  }

  return [...parts].slice(0, 60).join(" | ");
}
