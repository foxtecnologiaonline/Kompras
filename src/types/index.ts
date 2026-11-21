export interface ShoppingList {
  id: number;
  created_at: string;
  name: string | null;
  closed_at: string | null;
}

export interface ShoppingListItem {
  id: number;
  list_id: number;
  name: string;
  quantity: number;
  checked: boolean;
}

export type PurchaseSource = 'qr_parsed' | 'manual_fallback';

export interface Purchase {
  id: number;
  list_id: number | null;
  purchase_date: string;
  total_value: number;
  raw_source: PurchaseSource;
  receipt_photo_uri: string | null;
}

export interface PurchaseWithCount extends Purchase {
  item_count: number;
}

/** How a coupon item got tied to a list item: guessed by the matcher, or picked by the user. */
export type LinkSource = 'auto' | 'manual';

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  description: string;
  unit_value: number;
  quantity: number;
  /** The planned list item this coupon item fulfils, if any. */
  list_item_id: number | null;
  list_item_link_source: LinkSource | null;
}

export type RootStackParamList = {
  Lists: undefined;
  ListDetail: { listId: number };
  Scan: { listId: number };
  NfceWebView: { listId: number; url: string };
  History: undefined;
  HistoryDetail: { purchaseId: number };
};
