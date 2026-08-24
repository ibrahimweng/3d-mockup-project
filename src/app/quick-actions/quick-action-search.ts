import { tokenizeQuickActionQuery, tokenizeQuickActionText } from "./quick-action-text";
import { expandQuickActionToken } from "./quick-action-vocabulary";

export type QuickActionSearchFields = {
  /** The section the entry lives under, so "device" reaches everything in Device. */
  readonly groupLabel: string;
  /** Words worth as much as the title but not shown in it: targets, units, aliases. */
  readonly keywords: readonly string[];
  /** The schema's own long description. Weighted low: it is broad, so it is noisy. */
  readonly prose: string;
  /** What the row reads as on screen. */
  readonly title: string;
};

type QuickActionFieldIndex = {
  /** Kept alongside the set purely so prefix scans do not walk a Set. */
  readonly list: readonly string[];
  readonly set: ReadonlySet<string>;
};

export type QuickActionSearchDocument = {
  readonly group: QuickActionFieldIndex;
  readonly keywords: QuickActionFieldIndex;
  readonly prose: QuickActionFieldIndex;
  readonly title: QuickActionFieldIndex;
  /** Normalized title, for the whole-phrase bonus. */
  readonly titleText: string;
};

/**
 * A hit in the title is worth much more than a hit in the description, because
 * every control's description mentions the neighbouring controls it interacts
 * with — matching prose is evidence of relatedness, not of being the answer.
 */
const quickActionFieldWeights = {
  group: 3,
  keywords: 6,
  prose: 1.5,
  title: 10,
} as const;

/** Typing half a word should find it, but never outrank having typed all of it. */
const quickActionPrefixFactor = 0.55;
/** Reaching a word through the concept map counts, but naming it directly wins. */
const quickActionRelatedFactor = 0.6;
/**
 * Related words are read as an ordered list: the concept map is authored
 * most-likely-first, and that order is the only signal distinguishing the
 * finish someone means by "shiny" from the five other things shininess touches.
 * Without the decay every related word is worth the same and the ranking falls
 * back to alphabetical tie-breaking, which is no ranking at all.
 */
const quickActionRelatedDecayPerPosition = 0.12;
const quickActionRelatedFloorFactor = 0.3;
/** A title that literally contains what was typed is almost certainly the answer. */
const quickActionPhraseBonus = 8;
/** One letter prefixes match most of the index, which is the same as matching nothing. */
const quickActionMinimumPrefixLength = 2;
/**
 * Words that are both a state in this product and a preposition in English.
 * "on" is the answer in "turn the backdrop on" and pure filler in "put it on
 * wood"; nothing at this layer can tell the two apart, so they count quietly
 * and let the longer words in the query decide.
 *
 * Named individually rather than caught by a length rule, which was the first
 * attempt: `4k` and `8k` are two characters and are exactly what someone types
 * when they mean the resolution.
 */
const quickActionAmbiguousQueryWords: ReadonlySet<string> = new Set([
  "all", "back", "down", "off", "on", "out", "over", "under", "up",
]);
const quickActionAmbiguousWordFactor = 0.35;

function normalizeQuickActionPhrase(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildQuickActionFieldIndex(text: string): QuickActionFieldIndex {
  const list = [...new Set(tokenizeQuickActionText(text))];
  return { list, set: new Set(list) };
}

export function buildQuickActionSearchDocument(
  fields: QuickActionSearchFields,
): QuickActionSearchDocument {
  return {
    group: buildQuickActionFieldIndex(fields.groupLabel),
    keywords: buildQuickActionFieldIndex(fields.keywords.join(" ")),
    prose: buildQuickActionFieldIndex(fields.prose),
    title: buildQuickActionFieldIndex(fields.title),
    titleText: normalizeQuickActionPhrase(fields.title),
  };
}

/** 1 for an exact token, the prefix factor for an unfinished one, 0 for neither. */
function matchQuickActionField(field: QuickActionFieldIndex, candidate: string): number {
  if (field.set.has(candidate)) return 1;
  if (candidate.length < quickActionMinimumPrefixLength) return 0;
  return field.list.some((token) => token.startsWith(candidate))
    ? quickActionPrefixFactor
    : 0;
}

function scoreQuickActionCandidate(
  document: QuickActionSearchDocument,
  candidate: string,
): number {
  let best = 0;
  for (const [field, weight] of [
    [document.title, quickActionFieldWeights.title],
    [document.keywords, quickActionFieldWeights.keywords],
    [document.group, quickActionFieldWeights.group],
    [document.prose, quickActionFieldWeights.prose],
  ] as const) {
    best = Math.max(best, weight * matchQuickActionField(field, candidate));
  }
  return best;
}

export type QuickActionScore = {
  /** How many distinct query words the entry accounted for. */
  readonly matchedTokenCount: number;
  readonly score: number;
};

export function scoreQuickActionDocument(
  document: QuickActionSearchDocument,
  queryTokens: readonly string[],
  queryPhrase: string,
): QuickActionScore {
  let total = 0;
  let matchedTokenCount = 0;

  for (const token of queryTokens) {
    let best = scoreQuickActionCandidate(document, token);
    const related = expandQuickActionToken(token);
    for (let index = 0; index < related.length; index += 1) {
      const factor = Math.max(
        quickActionRelatedFloorFactor,
        quickActionRelatedFactor * (1 - quickActionRelatedDecayPerPosition * index),
      );
      best = Math.max(best, scoreQuickActionCandidate(document, related[index]) * factor);
    }
    if (quickActionAmbiguousQueryWords.has(token)) {
      best *= quickActionAmbiguousWordFactor;
    }
    if (best > 0) matchedTokenCount += 1;
    total += best;
  }

  if (total === 0) return { matchedTokenCount: 0, score: 0 };

  // An entry that answers one word of a four-word description is a weaker
  // answer than one that accounts for all four, even if that one word scored
  // highly. Halving rather than zeroing keeps partial matches visible, which is
  // the whole point when the person is describing rather than naming.
  const coverage = matchedTokenCount / queryTokens.length;
  let score = total * (0.5 + 0.5 * coverage);

  if (queryPhrase.length > 0 && document.titleText.includes(queryPhrase)) {
    score += quickActionPhraseBonus;
  }

  return { matchedTokenCount, score };
}

export type QuickActionSearchResult<Entry> = {
  readonly entry: Entry;
  readonly score: number;
};

/**
 * Ranks entries against free text. Returns `null` for a query with nothing to
 * match on, which the caller shows its default suggestions for rather than an
 * empty list.
 */
export type QuickActionSearchable = {
  readonly document: QuickActionSearchDocument;
  readonly id: string;
  readonly priority: number;
};

export function searchQuickActions<Entry extends QuickActionSearchable>(
  entries: readonly Entry[],
  query: string,
  limit: number,
): readonly QuickActionSearchResult<Entry>[] | null {
  const queryTokens = tokenizeQuickActionQuery(query);
  if (queryTokens.length === 0) return null;
  const queryPhrase = normalizeQuickActionPhrase(query);

  const results: QuickActionSearchResult<Entry>[] = [];
  for (const entry of entries) {
    const { score } = scoreQuickActionDocument(entry.document, queryTokens, queryPhrase);
    if (score > 0) results.push({ entry, score: score * entry.priority });
  }

  // Ties are broken by id so the list never reshuffles between identical
  // queries; a palette that reorders under the cursor loses the selection.
  results.sort((left, right) =>
    right.score === left.score
      ? left.entry.id.localeCompare(right.entry.id)
      : right.score - left.score,
  );
  return results.slice(0, limit);
}
