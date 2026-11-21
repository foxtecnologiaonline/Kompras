import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildComparison, summarizeChecked } from '../src/utils/comparison';
import type { PurchaseItem, ShoppingListItem } from '../src/types';

const item = (id: number, name: string, checked: boolean, quantity = 1): ShoppingListItem => ({
  id,
  list_id: 1,
  name,
  quantity,
  checked,
});

describe('summarizeChecked (level 1: only the "pego" flag)', () => {
  test('counts planned, checked and lists what was never ticked', () => {
    const s = summarizeChecked([item(1, 'Leite', true), item(2, 'Café', false), item(3, 'Sabão', false, 2)]);
    assert.equal(s.planned, 3);
    assert.equal(s.checked, 1);
    assert.deepEqual(s.missing.map((i) => i.name), ['Café', 'Sabão']);
  });

  test('everything ticked leaves nothing missing', () => {
    const s = summarizeChecked([item(1, 'Leite', true)]);
    assert.deepEqual([s.planned, s.checked, s.missing.length], [1, 1, 0]);
  });

  test('an empty list is all zeros', () => {
    assert.deepEqual(summarizeChecked([]), { planned: 0, checked: 0, missing: [] });
  });
});

const bought = (id: number, description: string, quantity: number, unit_value: number, list_item_id: number | null = null): PurchaseItem => ({
  id,
  purchase_id: 1,
  description,
  quantity,
  unit_value,
  list_item_id,
  list_item_link_source: list_item_id === null ? null : 'auto',
});

describe('buildComparison — linked mode (coupon items exist)', () => {
  const planned = [item(1, 'Leite', false, 2), item(2, 'Café', false), item(3, 'Sabão', true)];
  const coupon = [
    bought(10, 'LEITE UHT', 1, 6, 1), // planned 2, bought 1
    bought(11, 'CHOCOLATE', 1, 8), // off the list
    bought(12, 'BISCOITO', 2, 3), // off the list
  ];
  const c = buildComparison(planned, coupon);

  test('splits planned items into bought and left out, by link (not by the "pego" flag)', () => {
    assert.equal(c.mode, 'linked');
    assert.equal(c.planned, 3);
    assert.deepEqual(c.matched.map((r) => r.item.name), ['Leite']);
    assert.deepEqual(c.missing.map((r) => r.item.name), ['Café', 'Sabão']); // Sabão was ticked but not on the coupon
  });

  test('lists coupon items that fulfil no planned item and their weight on the total', () => {
    assert.deepEqual(c.outside.map((i) => i.description), ['CHOCOLATE', 'BISCOITO']);
    assert.equal(c.outsideTotal, 14);
    assert.equal(c.itemsTotal, 20);
    assert.equal(c.outsidePct, 70);
  });

  test('flags a whole-unit shortfall against the planned quantity', () => {
    assert.equal(c.matched[0].boughtLess, true);
  });

  test('does not flag weighed goods or buying more than planned', () => {
    const p = [item(1, 'Banana', false, 1), item(2, 'Leite', false, 1)];
    const r = buildComparison(p, [bought(10, 'BANANA KG', 0.485, 8, 1), bought(11, 'LEITE', 3, 6, 2)]);
    assert.deepEqual(r.matched.map((x) => x.boughtLess), [false, false]);
  });

  test('a link to an item that is not on the list counts as off the list', () => {
    const r = buildComparison([item(1, 'Leite', false)], [bought(10, 'LEITE', 1, 6, 999)]);
    assert.equal(r.matched.length, 0);
    assert.equal(r.outside.length, 1);
  });

  test('outsidePct is null when the coupon items carry no value', () => {
    assert.equal(buildComparison([item(1, 'Leite', false)], [bought(10, 'BRINDE', 1, 0)]).outsidePct, null);
  });
});

describe('buildComparison — checked mode (no coupon items)', () => {
  test('falls back to the "pego" flag', () => {
    const c = buildComparison([item(1, 'Leite', true), item(2, 'Café', false)], []);
    assert.equal(c.mode, 'checked');
    assert.deepEqual(c.matched.map((r) => r.item.name), ['Leite']);
    assert.deepEqual(c.missing.map((r) => r.item.name), ['Café']);
    assert.deepEqual([c.outside.length, c.outsideTotal, c.outsidePct], [0, 0, null]);
  });
});
