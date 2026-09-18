export interface ShoppingList {
  id: number;
  created_at: string;
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
}

export interface PurchaseWithCount extends Purchase {
  item_count: number;
}

export interface PurchaseItem {
  id: number;
  purchase_id: number;
  description: string;
  unit_value: number;
  quantity: number;
}

export type RootStackParamList = {
  Lists: undefined;
  ListDetail: { listId: number };
  Scan: { listId: number };
  History: undefined;
  HistoryDetail: { purchaseId: number };
};
