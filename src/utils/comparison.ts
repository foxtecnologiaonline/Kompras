import type { ShoppingListItem } from '../types';

export interface CheckedSummary {
  /** Items on the list when the purchase was closed. */
  planned: number;
  /** Items the user ticked as "pego" while shopping. */
  checked: number;
  /** Planned items that were never ticked. */
  missing: ShoppingListItem[];
}

/**
 * Level-1 planned × bought: uses only the "pego" flag, so it works for every
 * purchase — including manually-entered ones that have no coupon items.
 */
export function summarizeChecked(items: ShoppingListItem[]): CheckedSummary {
  const missing = items.filter((item) => !item.checked);
  return { planned: items.length, checked: items.length - missing.length, missing };
}
