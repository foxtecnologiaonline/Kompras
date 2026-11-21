import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchItems, tokenize } from '../src/utils/matching';

const planned = (...names: string[]) => names.map((name, i) => ({ id: i + 1, name }));
const bought = (...descriptions: string[]) => descriptions.map((description, i) => ({ id: (i + 1) * 100, description }));
/** "leite->LEITE UHT" style pairs, for readable assertions. */
const pairs = (p: ReturnType<typeof planned>, b: ReturnType<typeof bought>) =>
  matchItems(p, b).map((m) => [p.find((x) => x.id === m.plannedId)!.name, b.find((x) => x.id === m.boughtId)!.description]);

describe('tokenize', () => {
  test('lowercases, strips accents and punctuation', () => {
    assert.deepEqual(tokenize('Pão de Açúcar 2L'), ['pao', 'de', 'acucar', '2l']);
    assert.deepEqual(tokenize('  C/ LEITE-INTEGRAL!! '), ['c', 'leite', 'integral']);
    assert.deepEqual(tokenize(''), []);
  });
});

describe('matchItems', () => {
  test('a list word matches the start of a coupon word', () => {
    const p = planned('Leite');
    const b = bought('LEITE UHT INTEGRAL 1L');
    assert.deepEqual(pairs(p, b), [['Leite', 'LEITE UHT INTEGRAL 1L']]);
  });

  test('ignores accents and singular/plural', () => {
    assert.deepEqual(pairs(planned('Pão', 'bananas'), bought('PAO FRANCES KG', 'BANANA PRATA KG')), [
      ['Pão', 'PAO FRANCES KG'],
      ['bananas', 'BANANA PRATA KG'],
    ]);
  });

  test('fillers and sizes in the list name are not required to match', () => {
    assert.deepEqual(pairs(planned('Leite 1L'), bought('LEITE UHT 1000ML')), [['Leite 1L', 'LEITE UHT 1000ML']]);
    assert.deepEqual(pairs(planned('Pão de queijo'), bought('PAO QUEIJO CONGELADO')), [
      ['Pão de queijo', 'PAO QUEIJO CONGELADO'],
    ]);
  });

  test('every meaningful word must be present', () => {
    assert.deepEqual(pairs(planned('Arroz integral'), bought('ARROZ BRANCO 5KG')), []);
  });

  test('the more specific list item picks first ("leite condensado" before "leite")', () => {
    const p = planned('Leite', 'Leite condensado');
    const b = bought('LEITE CONDENSADO MOCOCA 395G', 'LEITE UHT 1L'); // condensed listed first on purpose
    assert.deepEqual(pairs(p, b), [
      ['Leite condensado', 'LEITE CONDENSADO MOCOCA 395G'],
      ['Leite', 'LEITE UHT 1L'],
    ]);
  });

  test('among candidates, the coupon item with the fewest extra words wins', () => {
    const p = planned('Leite');
    const b = bought('LEITE UHT INTEGRAL SEM LACTOSE 1L', 'LEITE UHT');
    assert.deepEqual(pairs(p, b), [['Leite', 'LEITE UHT']]);
  });

  test('is one-to-one on both sides', () => {
    assert.equal(matchItems(planned('Leite', 'Leite'), bought('LEITE UHT')).length, 1);
    assert.equal(matchItems(planned('Leite'), bought('LEITE UHT', 'LEITE INTEGRAL')).length, 1);
    assert.equal(matchItems(planned('Leite', 'Leite'), bought('LEITE UHT', 'LEITE INTEGRAL')).length, 2);
  });

  test('known limit: abbreviations and brand-only names are not matched', () => {
    assert.deepEqual(pairs(planned('Refri'), bought('COCA COLA 2L')), []);
  });

  test('names with no usable word never match (and never crash)', () => {
    assert.deepEqual(matchItems(planned('2L', 'de', ''), bought('LEITE 2L')), []);
    assert.deepEqual(matchItems([], bought('LEITE')), []);
    assert.deepEqual(matchItems(planned('Leite'), []), []);
  });
});
