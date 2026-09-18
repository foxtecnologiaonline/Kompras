import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Purchase,
  PurchaseItem,
  PurchaseSource,
  PurchaseWithCount,
  ShoppingList,
  ShoppingListItem,
} from '../types';

// ---- shopping_list ----

export async function createShoppingList(db: SQLiteDatabase): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO shopping_list (created_at) VALUES (?)',
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function getShoppingLists(db: SQLiteDatabase): Promise<ShoppingList[]> {
  return db.getAllAsync<ShoppingList>(
    'SELECT * FROM shopping_list ORDER BY created_at DESC'
  );
}

export async function deleteShoppingList(db: SQLiteDatabase, listId: number): Promise<void> {
  await db.runAsync('DELETE FROM shopping_list_item WHERE list_id = ?', listId);
  await db.runAsync('UPDATE purchase SET list_id = NULL WHERE list_id = ?', listId);
  await db.runAsync('DELETE FROM shopping_list WHERE id = ?', listId);
}

// ---- shopping_list_item ----

export async function getListItems(
  db: SQLiteDatabase,
  listId: number
): Promise<ShoppingListItem[]> {
  const rows = await db.getAllAsync<{
    id: number;
    list_id: number;
    name: string;
    checked: number;
  }>('SELECT * FROM shopping_list_item WHERE list_id = ? ORDER BY id ASC', listId);
  return rows.map((r) => ({ ...r, checked: !!r.checked }));
}

export async function addListItem(
  db: SQLiteDatabase,
  listId: number,
  name: string
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO shopping_list_item (list_id, name, checked) VALUES (?, ?, 0)',
    listId,
    name
  );
  return result.lastInsertRowId;
}

export async function updateListItemName(
  db: SQLiteDatabase,
  itemId: number,
  name: string
): Promise<void> {
  await db.runAsync('UPDATE shopping_list_item SET name = ? WHERE id = ?', name, itemId);
}

export async function setListItemChecked(
  db: SQLiteDatabase,
  itemId: number,
  checked: boolean
): Promise<void> {
  await db.runAsync(
    'UPDATE shopping_list_item SET checked = ? WHERE id = ?',
    checked ? 1 : 0,
    itemId
  );
}

export async function deleteListItem(db: SQLiteDatabase, itemId: number): Promise<void> {
  await db.runAsync('DELETE FROM shopping_list_item WHERE id = ?', itemId);
}

// ---- purchase ----

export async function createPurchase(
  db: SQLiteDatabase,
  listId: number | null,
  purchaseDate: string,
  totalValue: number,
  rawSource: PurchaseSource
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO purchase (list_id, purchase_date, total_value, raw_source) VALUES (?, ?, ?, ?)',
    listId,
    purchaseDate,
    totalValue,
    rawSource
  );
  return result.lastInsertRowId;
}

export async function addPurchaseItem(
  db: SQLiteDatabase,
  purchaseId: number,
  description: string,
  unitValue: number,
  quantity: number
): Promise<void> {
  await db.runAsync(
    'INSERT INTO purchase_item (purchase_id, description, unit_value, quantity) VALUES (?, ?, ?, ?)',
    purchaseId,
    description,
    unitValue,
    quantity
  );
}

export async function getPurchases(db: SQLiteDatabase): Promise<PurchaseWithCount[]> {
  return db.getAllAsync<PurchaseWithCount>(`
    SELECT p.*, (
      SELECT COUNT(*) FROM purchase_item pi WHERE pi.purchase_id = p.id
    ) AS item_count
    FROM purchase p
    ORDER BY p.purchase_date DESC
  `);
}

export async function getPurchase(
  db: SQLiteDatabase,
  purchaseId: number
): Promise<Purchase | null> {
  return db.getFirstAsync<Purchase>('SELECT * FROM purchase WHERE id = ?', purchaseId);
}

export async function getPurchaseItems(
  db: SQLiteDatabase,
  purchaseId: number
): Promise<PurchaseItem[]> {
  return db.getAllAsync<PurchaseItem>(
    'SELECT * FROM purchase_item WHERE purchase_id = ? ORDER BY id ASC',
    purchaseId
  );
}
