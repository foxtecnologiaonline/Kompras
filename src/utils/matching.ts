/** Lowercases, strips accents and trims, so "Açúcar" and "ACUCAR " compare equal. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * True when two words are the same, or one is a prefix of the other with at
 * most a 2-character difference — catches singular/plural pairs
 * ("ovo"/"ovos", "cebola"/"cebolas") without matching unrelated words that
 * happen to share a prefix ("sal"/"salada", "molho"/"molhozinho") or a short
 * word that merely appears mid-string ("ovo" must not match "novo").
 */
function wordsMatch(w1: string, w2: string): boolean {
  if (w1 === w2) return true;
  if (w1.length < 3 || w2.length < 3) return false;
  const [shorter, longer] = w1.length <= w2.length ? [w1, w2] : [w2, w1];
  return longer.startsWith(shorter) && longer.length - shorter.length <= 2;
}

/**
 * True when the words of the shorter name all have a match among the words
 * of the longer name, so "Leite" matches "Leite Integral 1L" and "Ovo"
 * matches "Ovos Brancos 12un", but "Ovo" does not match "Novo Produto".
 */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const wordsA = na.split(/\s+/).filter(Boolean);
  const wordsB = nb.split(/\s+/).filter(Boolean);
  const [shorter, longer] = wordsA.length <= wordsB.length ? [wordsA, wordsB] : [wordsB, wordsA];

  return shorter.every((sw) => longer.some((lw) => wordsMatch(sw, lw)));
}
