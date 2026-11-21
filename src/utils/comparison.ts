import type { PurchaseItem, ShoppingListItem } from '../types';

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

export interface PlannedRow {
  item: ShoppingListItem;
  /** The coupon item linked to it; null when it was not bought (or not found). */
  bought: PurchaseItem | null;
  /** Fewer units on the coupon than planned (see buildComparison). */
  boughtLess: boolean;
}

export interface Comparison {
  /**
   * 'linked': the purchase has coupon items, so planned items are matched to
   * them. 'checked': no coupon items (manual entry), so only the "pego" flag
   * is available.
   */
  mode: 'linked' | 'checked';
  planned: number;
  /** Planned items that were bought (linked) / ticked (checked mode). */
  matched: PlannedRow[];
  /** Planned items that were not bought (linked) / never ticked (checked). */
  missing: PlannedRow[];
  /** Coupon items that fulfil no planned item: bought off the list. */
  outside: PurchaseItem[];
  outsideTotal: number;
  itemsTotal: number;
  /** Share of the coupon items' value that was off the list, 0–100; null without values. */
  outsidePct: number | null;
}

const itemValue = (i: PurchaseItem) => i.quantity * i.unit_value;

export function buildComparison(planned: ShoppingListItem[], purchaseItems: PurchaseItem[]): Comparison {
  if (purchaseItems.length === 0) {
    const summary = summarizeChecked(planned);
    const toRow = (item: ShoppingListItem): PlannedRow => ({ item, bought: null, boughtLess: false });
    return {
      mode: 'checked',
      planned: summary.planned,
      matched: planned.filter((i) => i.checked).map(toRow),
      missing: summary.missing.map(toRow),
      outside: [],
      outsideTotal: 0,
      itemsTotal: 0,
      outsidePct: null,
    };
  }

  const boughtByListItem = new Map<number, PurchaseItem>();
  for (const pi of purchaseItems) {
    if (pi.list_item_id !== null) boughtByListItem.set(pi.list_item_id, pi);
  }
  const plannedIds = new Set(planned.map((p) => p.id));

  const matched: PlannedRow[] = [];
  const missing: PlannedRow[] = [];
  for (const item of planned) {
    const bought = boughtByListItem.get(item.id) ?? null;
    // Only flag whole-unit shortfalls ("2 planned, 1 bought"). Weighed goods
    // come as 0.485 kg against a planned "1", which is not a shortfall.
    const boughtLess = bought !== null && Number.isInteger(bought.quantity) && bought.quantity < item.quantity;
    (bought ? matched : missing).push({ item, bought, boughtLess });
  }

  const outside = purchaseItems.filter((pi) => pi.list_item_id === null || !plannedIds.has(pi.list_item_id));
  const outsideTotal = outside.reduce((sum, i) => sum + itemValue(i), 0);
  const itemsTotal = purchaseItems.reduce((sum, i) => sum + itemValue(i), 0);

  return {
    mode: 'linked',
    planned: planned.length,
    matched,
    missing,
    outside,
    outsideTotal,
    itemsTotal,
    outsidePct: itemsTotal > 0 ? (outsideTotal / itemsTotal) * 100 : null,
  };
}
