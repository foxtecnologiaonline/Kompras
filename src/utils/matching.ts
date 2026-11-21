/**
 * Suggests which coupon item fulfils which planned list item. Deliberately
 * simple (no catalog, no fuzzy distance): every meaningful word of the list
 * item must be the start of some word of the coupon description, so "leite"
 * matches "LEITE UHT INTEGRAL 1L". It will miss abbreviations ("refri") and can
 * pick the wrong one when several items share a word — the user corrects those
 * by hand, so a wrong guess is cheap and a missed one is just unlinked.
 */

export interface PlannedItem {
  id: number;
  name: string;
}

export interface BoughtItem {
  id: number;
  description: string;
}

export interface Match {
  plannedId: number;
  boughtId: number;
}

const MIN_TOKEN_LENGTH = 3;

/** Lowercase, accent-free words: "Pão de Açúcar 2L" -> ["pao", "de", "acucar", "2l"]. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 0);
}

/** Words a coupon item must contain: skips fillers ("de", "c/") and sizes ("2l", "500g"). */
function requiredTokens(name: string): string[] {
  return tokenize(name).filter((t) => t.length >= MIN_TOKEN_LENGTH && !/^\d/.test(t));
}

/** "leite" ~ "leite" / "leites"; "bananas" ~ "banana". Prefix either way, never on tiny words. */
function tokenMatches(wanted: string, candidate: string): boolean {
  return candidate.startsWith(wanted) || (candidate.length >= 4 && wanted.startsWith(candidate));
}

interface Candidate {
  plannedId: number;
  boughtId: number;
  required: number;
  extra: number;
  plannedOrder: number;
  boughtOrder: number;
}

/**
 * One-to-one matching. The most specific list items pick first ("leite
 * condensado" before "leite"), and among coupon items the one with the fewest
 * extra words wins ("LEITE UHT" over "LEITE UHT INTEGRAL SEM LACTOSE 1L").
 */
export function matchItems(planned: PlannedItem[], bought: BoughtItem[]): Match[] {
  const boughtTokens = bought.map((b) => tokenize(b.description));
  const candidates: Candidate[] = [];

  planned.forEach((p, plannedOrder) => {
    const required = requiredTokens(p.name);
    if (required.length === 0) return;
    bought.forEach((b, boughtOrder) => {
      const tokens = boughtTokens[boughtOrder];
      if (required.every((w) => tokens.some((c) => tokenMatches(w, c)))) {
        candidates.push({
          plannedId: p.id,
          boughtId: b.id,
          required: required.length,
          extra: tokens.length - required.length,
          plannedOrder,
          boughtOrder,
        });
      }
    });
  });

  candidates.sort(
    (a, b) =>
      b.required - a.required ||
      a.extra - b.extra ||
      a.plannedOrder - b.plannedOrder ||
      a.boughtOrder - b.boughtOrder
  );

  const usedPlanned = new Set<number>();
  const usedBought = new Set<number>();
  const matches: Match[] = [];
  for (const c of candidates) {
    if (usedPlanned.has(c.plannedId) || usedBought.has(c.boughtId)) continue;
    usedPlanned.add(c.plannedId);
    usedBought.add(c.boughtId);
    matches.push({ plannedId: c.plannedId, boughtId: c.boughtId });
  }
  return matches;
}
