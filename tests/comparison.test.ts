import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeChecked } from '../src/utils/comparison';
import type { ShoppingListItem } from '../src/types';

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
