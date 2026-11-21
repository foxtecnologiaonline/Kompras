import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrateDbIfNeeded } from '../src/db/database';
import * as repo from '../src/db/repository';
import { parseNfceHtml } from '../src/utils/nfce';
import { buildComparison } from '../src/utils/comparison';
import { createTestDb } from './helpers/sqliteShim';

// The whole "close a purchase" path, as the app runs it: a planned list, the
// coupon page parsed, the purchase saved with automatic links, and the
// planned × bought comparison read back (fixture is synthetic, see fixtures/README.md).
test('list -> coupon HTML -> purchase with auto links -> comparison', async () => {
  const { db } = createTestDb();
  await migrateDbIfNeeded(db);

  const listId = await repo.createShoppingList(db, 'Mensal');
  await repo.addListItems(db, listId, ['Leite', 'Banana', 'Café']);
  const planned = await repo.getListItems(db, listId);

  const parsed = parseNfceHtml(readFileSync(join(__dirname, 'fixtures', 'current-layout.html'), 'utf8'));
  const purchaseId = await repo.createPurchase(db, {
    listId,
    purchaseDate: parsed.purchaseDate,
    totalValue: parsed.totalValue,
    rawSource: 'qr_parsed',
    items: parsed.items,
  });

  const comparison = buildComparison(planned, await repo.getPurchaseItems(db, purchaseId));

  assert.equal(comparison.mode, 'linked');
  assert.deepEqual(comparison.matched.map((r) => [r.item.name, r.bought?.description]), [
    ['Leite', 'LEITE UHT INTEGRAL 1L'],
    ['Banana', 'BANANA PRATA KG'],
  ]);
  assert.deepEqual(comparison.missing.map((r) => r.item.name), ['Café']);
  assert.deepEqual(comparison.outside.map((i) => i.description), ['ARROZ & FEIJÃO KIT']);
  assert.equal(Math.round(comparison.outsidePct ?? -1), 99); // the R$ 1.234,56 kit dominates this coupon
  assert.ok((await repo.getShoppingList(db, listId))?.closed_at);
});
