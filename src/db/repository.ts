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

export async function createShoppingList(
  db: SQLiteDatabase,
  name: string | null = null
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO shopping_list (created_at, name) VALUES (?, ?)',
    new Date().toISOString(),
    name
  );
  return result.lastInsertRowId;
}

export async function getShoppingLists(db: SQLiteDatabase): Promise<ShoppingList[]> {
  return db.getAllAsync<ShoppingList>(
    'SELECT * FROM shopping_list ORDER BY created_at DESC'
  );
}

export async function getShoppingList(
  db: SQLiteDatabase,
  listId: number
): Promise<ShoppingList | null> {
  return db.getFirstAsync<ShoppingList>('SELECT * FROM shopping_list WHERE id = ?', listId);
}

export async function updateShoppingListName(
  db: SQLiteDatabase,
  listId: number,
  name: string | null
): Promise<void> {
  await db.runAsync('UPDATE shopping_list SET name = ? WHERE id = ?', name, listId);
}

export async function deleteShoppingList(db: SQLiteDatabase, listId: number): Promise<void> {
  // Order matters now that foreign keys are enforced: children first, and the
  // purchases (history) are detached rather than deleted.
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM shopping_list_item WHERE list_id = ?', listId);
    await db.runAsync('UPDATE purchase SET list_id = NULL WHERE list_id = ?', listId);
    await db.runAsync('DELETE FROM shopping_list WHERE id = ?', listId);
  });
}

/** Lets a closed list be closed again (e.g. the first purchase was recorded by mistake). */
export async function reopenShoppingList(db: SQLiteDatabase, listId: number): Promise<void> {
  await db.runAsync('UPDATE shopping_list SET closed_at = NULL WHERE id = ?', listId);
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
    quantity: number;
    checked: number;
  }>('SELECT * FROM shopping_list_item WHERE list_id = ? ORDER BY id ASC', listId);
  return rows.map((r) => ({ ...r, checked: !!r.checked }));
}

export async function addListItem(
  db: SQLiteDatabase,
  listId: number,
  name: string,
  quantity: number = 1
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO shopping_list_item (list_id, name, quantity, checked) VALUES (?, ?, ?, 0)',
    listId,
    name,
    quantity
  );
  return result.lastInsertRowId;
}

/** Inserts several items in one transaction (e.g. pasting a multi-line list). */
export async function addListItems(
  db: SQLiteDatabase,
  listId: number,
  names: string[]
): Promise<void> {
  if (names.length === 0) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const name of names) {
      await txn.runAsync(
        'INSERT INTO shopping_list_item (list_id, name, quantity, checked) VALUES (?, ?, 1, 0)',
        listId,
        name
      );
    }
  });
}

export async function updateListItemName(
  db: SQLiteDatabase,
  itemId: number,
  name: string
): Promise<void> {
  await db.runAsync('UPDATE shopping_list_item SET name = ? WHERE id = ?', name, itemId);
}

export async function updateListItemQuantity(
  db: SQLiteDatabase,
  itemId: number,
  quantity: number
): Promise<void> {
  await db.runAsync(
    'UPDATE shopping_list_item SET quantity = ? WHERE id = ?',
    quantity,
    itemId
  );
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

export interface NewPurchaseItem {
  description: string;
  unitValue: number;
  quantity: number;
}

export interface NewPurchase {
  listId: number | null;
  purchaseDate: string;
  totalValue: number;
  rawSource: PurchaseSource;
  receiptPhotoUri?: string | null;
  items?: NewPurchaseItem[];
}

/**
 * Records a purchase, its items and — when it belongs to a list — marks that
 * list as closed, all in one transaction: either everything is saved or
 * nothing is, so a failure halfway never leaves a purchase with missing items.
 *
 * Uses withTransactionAsync (not the exclusive variant) so the writes stay on
 * the main connection where foreign keys are enforced. Only call this with no
 * other database work in flight.
 */
export async function createPurchase(db: SQLiteDatabase, purchase: NewPurchase): Promise<number> {
  let purchaseId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      'INSERT INTO purchase (list_id, purchase_date, total_value, raw_source, receipt_photo_uri) VALUES (?, ?, ?, ?, ?)',
      purchase.listId,
      purchase.purchaseDate,
      purchase.totalValue,
      purchase.rawSource,
      purchase.receiptPhotoUri ?? null
    );
    purchaseId = result.lastInsertRowId;

    for (const item of purchase.items ?? []) {
      await db.runAsync(
        'INSERT INTO purchase_item (purchase_id, description, unit_value, quantity) VALUES (?, ?, ?, ?)',
        purchaseId,
        item.description,
        item.unitValue,
        item.quantity
      );
    }

    if (purchase.listId !== null) {
      await db.runAsync(
        'UPDATE shopping_list SET closed_at = ? WHERE id = ?',
        new Date().toISOString(),
        purchase.listId
      );
    }
  });
  return purchaseId;
}

/** Most recent purchase recorded for a list, used to jump from a closed list to its receipt. */
export async function getLatestPurchaseIdForList(
  db: SQLiteDatabase,
  listId: number
): Promise<number | null> {
  const row = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM purchase WHERE list_id = ? ORDER BY id DESC LIMIT 1',
    listId
  );
  return row?.id ?? null;
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
