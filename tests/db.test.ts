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
    assert.equal(pragma('user_version'), 5);
    assert.equal(pragma('foreign_keys'), 1);
  });

  test('running the migration again is a no-op', async () => {
    await repo.createShoppingList(db, 'Mensal');
    await migrateDbIfNeeded(db);
    assert.equal(countRows('shopping_list'), 1);
    assert.equal(pragma('user_version'), 5);
  });

  test('upgrading an existing v4 database keeps its data and adds closed_at', async () => {
    raw.exec('ALTER TABLE shopping_list DROP COLUMN closed_at; PRAGMA user_version = 4;');
    raw.prepare("INSERT INTO shopping_list (created_at, name) VALUES ('2026-09-01T00:00:00Z', 'Antiga')").run();

    await migrateDbIfNeeded(db);

    const list = await repo.getShoppingList(db, 1);
    assert.equal(list?.name, 'Antiga');
    assert.equal(list?.closed_at, null);
    assert.equal(pragma('user_version'), 5);
  });

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
