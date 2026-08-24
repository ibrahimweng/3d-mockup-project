/**
 * Query text and schema prose are reduced by the same rules, because every
 * match is between two tokens that came out of this module. Comparing a raw
 * query word against an already-stemmed index word silently loses every plural
 * and every tense the user typed, and the loss is invisible: the search simply
 * returns less than it should.
 */

/**
 * Deliberately short. Words that read as filler in prose are load-bearing in a
 * device studio — `on`/`off` name toggle states, `up`/`down` and `out` name
 * directions, `no`/`none` name the absence of a backdrop. Dropping them to
 * follow the usual stop-word list would make "no background" unsearchable.
 */
const quickActionStopWords: ReadonlySet<string> = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "could", "do",
  "does", "for", "from", "get", "give", "has", "have", "how", "i", "if", "in",
  "into", "is", "it", "its", "just", "let", "like", "make", "makes", "making",
  "me", "my", "need", "of", "please", "put", "should", "so", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "to", "want",
  "wanna", "was", "way", "we", "were", "what", "when", "where", "which",
  "while", "will", "with", "would", "you", "your",
]);

/** `spinn` from `spinning` is not a word anyone indexed; `spin` is. */
function undoubleFinalConsonant(word: string): string {
  const last = word.at(-1);
  if (last === undefined || last !== word.at(-2)) return word;
  return "aeiou".includes(last) ? word : word.slice(0, -1);
}

/**
 * A deliberately small stemmer. It only has to be *consistent* — both sides of
 * every comparison pass through it — so it aims to collapse the endings English
 * actually inflects and to leave everything else alone. Semantic reach is the
 * concept map's job, not this function's; an aggressive stemmer here would
 * merge words that mean different things in this product ("gloss" and "glass"
 * are one careless rule apart).
 */
export function stemQuickActionWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length > 5) {
    return undoubleFinalConsonant(word.slice(0, -3));
  }
  if (word.endsWith("ed") && word.length > 4) {
    return undoubleFinalConsonant(word.slice(0, -2));
  }
  if (word.length > 4 && /(?:sh|ch|x|s|z)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return stemQuickActionWord(word.slice(0, -1));
  }
  // `rotate`, `rotates`, `rotated` and `rotating` all have to land together.
  if (word.endsWith("e") && word.length > 4) return word.slice(0, -1);
  return word;
}

/** Reduces free text to the stemmed, meaning-carrying tokens the index stores. */
export function tokenizeQuickActionText(text: string): readonly string[] {
  const tokens: string[] = [];
  for (const word of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length === 0 || quickActionStopWords.has(word)) continue;
    tokens.push(stemQuickActionWord(word));
  }
  return tokens;
}

/** Query tokens are counted for coverage, so a repeated word must not count twice. */
export function tokenizeQuickActionQuery(text: string): readonly string[] {
  return [...new Set(tokenizeQuickActionText(text))];
}
