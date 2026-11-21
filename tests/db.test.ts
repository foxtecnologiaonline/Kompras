import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from '../src/db/database';
import * as repo from '../src/db/repository';
import { createTestDb } from './helpers/sqliteShim';

let db: SQLiteDatabase;
let raw: DatabaseSync;

const pragma = (name: string) => (raw.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[name];
const countRows = (table: string) => (raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

beforeEach(async () => {
  ({ db, raw } = createTestDb());
  await migrateDbIfNeeded(db);
});

describe('migrations', () => {
  test('a fresh database ends at the latest version with foreign keys on', () => {
    assert.equal(pragma('user_version'), 6);
    assert.equal(pragma('foreign_keys'), 1);
  });

  test('running the migration again is a no-op', async () => {
    await repo.createShoppingList(db, 'Mensal');
    await migrateDbIfNeeded(db);
    assert.equal(countRows('shopping_list'), 1);
    assert.equal(pragma('user_version'), 6);
  });

  // Schemas as shipped in earlier app versions, so upgrades are tested against
  // what users really have on their phones (not against a mutated fresh DB).
  const LEGACY_V4 = `
    CREATE TABLE shopping_list (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT);
    CREATE TABLE shopping_list_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER NOT NULL, name TEXT NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0, quantity REAL NOT NULL DEFAULT 1,
      FOREIGN KEY (list_id) REFERENCES shopping_list(id));
    CREATE TABLE purchase (
      id INTEGER PRIMARY KEY AUTOINCREMENT, list_id INTEGER, purchase_date TEXT NOT NULL,
      total_value REAL NOT NULL, raw_source TEXT NOT NULL, receipt_photo_uri TEXT,
      FOREIGN KEY (list_id) REFERENCES shopping_list(id));
    CREATE TABLE purchase_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL, description TEXT NOT NULL,
      unit_value REAL NOT NULL, quantity REAL NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchase(id));
  `;
  const LEGACY_V5 = LEGACY_V4 + 'ALTER TABLE shopping_list ADD COLUMN closed_at TEXT;';

  for (const [from, ddl] of [[4, LEGACY_V4], [5, LEGACY_V5]] as const) {
    test(`upgrading a real v${from} database keeps its data and reaches v6`, async () => {
      ({ db, raw } = createTestDb());
      raw.exec(ddl);
      raw.exec(`PRAGMA user_version = ${from};`);
      raw.exec(`
        INSERT INTO shopping_list (id, created_at, name) VALUES (1, '2026-09-01T00:00:00Z', 'Antiga');
        INSERT INTO shopping_list_item (list_id, name) VALUES (1, 'Leite');
        INSERT INTO purchase (id, list_id, purchase_date, total_value, raw_source) VALUES (1, 1, '2026-09-02T00:00:00Z', 6, 'qr_parsed');
        INSERT INTO purchase_item (purchase_id, description, unit_value, quantity) VALUES (1, 'LEITE', 6, 1);
      `);

      await migrateDbIfNeeded(db);

      assert.equal(pragma('user_version'), 6);
      assert.equal((await repo.getShoppingList(db, 1))?.name, 'Antiga');
      const [pi] = await repo.getPurchaseItems(db, 1);
      assert.equal(pi.description, 'LEITE');
      assert.equal(pi.list_item_id, null);
      assert.equal(pi.list_item_link_source, null);
      const list = await repo.getShoppingList(db, 1);
      assert.equal(list?.closed_at, null);
    });
  }

  test('foreign keys reject an item pointing at a missing list', async () => {
    await assert.rejects(() => repo.addListItem(db, 999, 'órfão'));
  });
});

describe('createPurchase', () => {
  test('saves purchase and items, and closes the list', async () => {
    const listId = await repo.createShoppingList(db, 'Mensal');
    const id = await repo.createPurchase(db, {
      listId,
      purchaseDate: '2026-11-01T00:00:00Z',
      totalValue: 11.98,
      rawSource: 'qr_parsed',
      items: [
        { description: 'LEITE', quantity: 2, unitValue: 5.99 },
        { description: 'PAO', quantity: 1, unitValue: 0 },
      ],
    });

    assert.equal((await repo.getPurchaseItems(db, id)).length, 2);
    assert.ok((await repo.getShoppingList(db, listId))?.closed_at);
    assert.equal(await repo.getLatestPurchaseIdForList(db, listId), id);
  });

  test('a manual purchase has no items and stores the attachment uri', async () => {
    const listId = await repo.createShoppingList(db);
    const id = await repo.createPurchase(db, {
      listId,
      purchaseDate: '2026-11-01T00:00:00Z',
      totalValue: 42,
      rawSource: 'manual_fallback',
      receiptPhotoUri: 'file:///receipts/r.pdf',
    });
    const p = await repo.getPurchase(db, id);
    assert.equal(p?.receipt_photo_uri, 'file:///receipts/r.pdf');
    assert.equal(p?.raw_source, 'manual_fallback');
    assert.equal((await repo.getPurchaseItems(db, id)).length, 0);
  });

  test('a failure midway rolls everything back: no purchase, no items, list stays open', async () => {
    const listId = await repo.createShoppingList(db, 'Falha');
    await assert.rejects(() =>
      repo.createPurchase(db, {
        listId,
        purchaseDate: '2026-11-02T00:00:00Z',
        totalValue: 5,
        rawSource: 'qr_parsed',
        items: [
          { description: 'ok', quantity: 1, unitValue: 1 },
          { description: null as unknown as string, quantity: 1, unitValue: 1 }, // violates NOT NULL
        ],
      })
    );
    assert.equal(countRows('purchase'), 0);
    assert.equal(countRows('purchase_item'), 0);
    assert.equal((await repo.getShoppingList(db, listId))?.closed_at, null);
  });

  test('a purchase for a list that does not exist is rejected (foreign key)', async () => {
    await assert.rejects(() =>
      repo.createPurchase(db, {
        listId: 999,
        purchaseDate: '2026-11-02T00:00:00Z',
        totalValue: 5,
        rawSource: 'manual_fallback',
      })
    );
    assert.equal(countRows('purchase'), 0);
  });
});

describe('closing, reopening and deleting lists', () => {
  test('reopening clears closed_at', async () => {
    const listId = await repo.createShoppingList(db);
    await repo.createPurchase(db, { listId, purchaseDate: '2026-11-01T00:00:00Z', totalValue: 1, rawSource: 'manual_fallback' });
    await repo.reopenShoppingList(db, listId);
    assert.equal((await repo.getShoppingList(db, listId))?.closed_at, null);
  });

  test('deleting a list removes its items but keeps the purchase in the history', async () => {
    const listId = await repo.createShoppingList(db, 'Mensal');
    await repo.addListItem(db, listId, 'Leite');
    const id = await repo.createPurchase(db, {
      listId,
      purchaseDate: '2026-11-01T00:00:00Z',
      totalValue: 5.99,
      rawSource: 'qr_parsed',
      items: [{ description: 'LEITE', quantity: 1, unitValue: 5.99 }],
    });

    await repo.deleteShoppingList(db, listId);

    assert.equal(await repo.getShoppingList(db, listId), null);
    assert.equal((await repo.getListItems(db, listId)).length, 0);
    assert.equal((await repo.getPurchase(db, id))?.list_id, null);
    assert.equal((await repo.getPurchaseItems(db, id)).length, 1);
  });
});

describe('list items', () => {
  test('addListItems inserts all lines and checked toggles', async () => {
    const listId = await repo.createShoppingList(db);
    await repo.addListItems(db, listId, ['Arroz', 'Feijão', 'Café']);
    const items = await repo.getListItems(db, listId);
    assert.deepEqual(items.map((i) => i.name), ['Arroz', 'Feijão', 'Café']);
    assert.ok(items.every((i) => i.checked === false && i.quantity === 1));

    await repo.setListItemChecked(db, items[0].id, true);
    assert.equal((await repo.getListItems(db, listId))[0].checked, true);
  });
});

describe('planned × bought links', () => {
  /** A list with Leite/Café/Sabão, closed by a coupon that has leite, chocolate and sabão. */
  async function closedListWithCoupon() {
    const listId = await repo.createShoppingList(db, 'Mensal');
    await repo.addListItems(db, listId, ['Leite', 'Café', 'Sabão']);
    const [leite, cafe, sabao] = await repo.getListItems(db, listId);
    const purchaseId = await repo.createPurchase(db, {
      listId,
      purchaseDate: '2026-11-01T00:00:00Z',
      totalValue: 20,
      rawSource: 'qr_parsed',
      items: [
        { description: 'LEITE UHT INTEGRAL 1L', quantity: 1, unitValue: 6 },
        { description: 'CHOCOLATE LACTA 90G', quantity: 1, unitValue: 8 },
        { description: 'SABAO EM PO 1KG', quantity: 1, unitValue: 6 },
      ],
    });
    const [pLeite, pChoc, pSabao] = await repo.getPurchaseItems(db, purchaseId);
    return { listId, purchaseId, leite, cafe, sabao, pLeite, pChoc, pSabao };
  }

  test('createPurchase links coupon items to planned items automatically', async () => {
    const { leite, sabao, purchaseId } = await closedListWithCoupon();
    const items = await repo.getPurchaseItems(db, purchaseId);
    assert.deepEqual(
      items.map((i) => [i.description, i.list_item_id, i.list_item_link_source]),
      [
        ['LEITE UHT INTEGRAL 1L', leite.id, 'auto'],
        ['CHOCOLATE LACTA 90G', null, null],
        ['SABAO EM PO 1KG', sabao.id, 'auto'],
      ]
    );
  });

  test('a manual purchase (no coupon items) creates no links', async () => {
    const listId = await repo.createShoppingList(db);
    await repo.addListItem(db, listId, 'Leite');
    const id = await repo.createPurchase(db, { listId, purchaseDate: '2026-11-01T00:00:00Z', totalValue: 9, rawSource: 'manual_fallback' });
    assert.equal((await repo.getPurchaseItems(db, id)).length, 0);
  });

  test('linkPurchaseItem ties a coupon item to a list item and marks it manual', async () => {
    const { cafe, pChoc, purchaseId } = await closedListWithCoupon();
    await repo.linkPurchaseItem(db, pChoc.id, cafe.id);
    const item = (await repo.getPurchaseItems(db, purchaseId)).find((i) => i.id === pChoc.id)!;
    assert.deepEqual([item.list_item_id, item.list_item_link_source], [cafe.id, 'manual']);
  });

  test('re-linking a list item moves it: it fulfils only one coupon item per purchase', async () => {
    const { leite, pLeite, pChoc, purchaseId } = await closedListWithCoupon();
    await repo.linkPurchaseItem(db, pChoc.id, leite.id); // leite was auto-linked to pLeite
    const items = await repo.getPurchaseItems(db, purchaseId);
    assert.equal(items.find((i) => i.id === pLeite.id)!.list_item_id, null);
    assert.equal(items.find((i) => i.id === pChoc.id)!.list_item_id, leite.id);
  });

  test('unlinkPurchaseItem clears the link and its source', async () => {
    const { pLeite, purchaseId } = await closedListWithCoupon();
    await repo.unlinkPurchaseItem(db, pLeite.id);
    const item = (await repo.getPurchaseItems(db, purchaseId)).find((i) => i.id === pLeite.id)!;
    assert.deepEqual([item.list_item_id, item.list_item_link_source], [null, null]);
  });

  test('refuses to link to an item of a different list', async () => {
    const { pChoc } = await closedListWithCoupon();
    const other = await repo.createShoppingList(db, 'Outra');
    const foreign = await repo.addListItem(db, other, 'Pilha');
    await assert.rejects(() => repo.linkPurchaseItem(db, pChoc.id, foreign), /não pertence à lista/);
  });

  test('deleting a linked list item is allowed and clears the link', async () => {
    const { leite, pLeite, purchaseId } = await closedListWithCoupon();
    await repo.deleteListItem(db, leite.id);
    const item = (await repo.getPurchaseItems(db, purchaseId)).find((i) => i.id === pLeite.id)!;
    assert.equal(item.list_item_id, null);
    assert.equal(item.description, 'LEITE UHT INTEGRAL 1L'); // the coupon item itself stays
  });

  test('deleting a list with linked items is allowed; the coupon and its items stay', async () => {
    const { listId, purchaseId } = await closedListWithCoupon();
    await repo.deleteShoppingList(db, listId);
    const items = await repo.getPurchaseItems(db, purchaseId);
    assert.equal(items.length, 3);
    assert.ok(items.every((i) => i.list_item_id === null && i.list_item_link_source === null));
  });
});

describe('deletePurchase', () => {
  const purchaseFor = (listId: number | null, receiptPhotoUri?: string) =>
    repo.createPurchase(db, {
      listId,
      purchaseDate: '2026-11-01T00:00:00Z',
      totalValue: 6,
      rawSource: receiptPhotoUri ? 'manual_fallback' : 'qr_parsed',
      receiptPhotoUri,
      items: receiptPhotoUri ? [] : [{ description: 'LEITE', quantity: 1, unitValue: 6 }],
    });

  test('removes the purchase and its items (even when linked to list items)', async () => {
    const listId = await repo.createShoppingList(db);
    await repo.addListItem(db, listId, 'Leite');
    const id = await purchaseFor(listId); // auto-links LEITE to the list item
    assert.equal(await repo.deletePurchase(db, id), null);
    assert.equal(await repo.getPurchase(db, id), null);
    assert.equal(countRows('purchase_item'), 0);
    assert.equal(countRows('shopping_list_item'), 1); // the plan itself is untouched
  });

  test('returns the receipt uri so the caller can delete the file', async () => {
    const id = await purchaseFor(null, 'file:///receipts/r.pdf');
    assert.equal(await repo.deletePurchase(db, id), 'file:///receipts/r.pdf');
  });

  test("reopens the list when that was the list's only purchase", async () => {
    const listId = await repo.createShoppingList(db);
    const id = await purchaseFor(listId);
    assert.ok((await repo.getShoppingList(db, listId))?.closed_at);
    await repo.deletePurchase(db, id);
    assert.equal((await repo.getShoppingList(db, listId))?.closed_at, null);
  });

  test('keeps the list closed when it still has another purchase', async () => {
    const listId = await repo.createShoppingList(db);
    const first = await purchaseFor(listId);
    await repo.reopenShoppingList(db, listId);
    await purchaseFor(listId); // second purchase closes it again
    await repo.deletePurchase(db, first);
    assert.ok((await repo.getShoppingList(db, listId))?.closed_at);
  });

  test('deleting a purchase that does not exist is a harmless no-op', async () => {
    assert.equal(await repo.deletePurchase(db, 999), null);
  });
});
