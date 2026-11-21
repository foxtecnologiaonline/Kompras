import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  extractUrlFromQrData,
  findTotalMismatch,
  parseNfceHtml,
  stripScriptsAndStyles,
} from '../src/utils/nfce';

// Fixtures are synthetic (see fixtures/README.md), not real captures.
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

/** Wraps rows in the current portal's #myTable body plus a totals block. */
function currentLayout(rows: string[], total: string | null = '10.00', date = '21/09/2026 18:42:07') {
  const totalBlock = total === null ? '' : `<strong>Valor total R$ </strong><strong>${total}</strong>`;
  return `<body>${date}<table><tbody id="myTable">${rows.join('')}</tbody></table>${totalBlock}</body>`;
}
const row = (name: string, qty: string, value: string) =>
  `<tr><td><h7>${name}</h7>Qtde total de ítens: ${qty} Valor total R$: R$ ${value}</td></tr>`;

describe('extractUrlFromQrData', () => {
  test('returns a plain URL as is', () => {
    const url = 'https://portalsped.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=31260912345';
    assert.equal(extractUrlFromQrData(url), url);
  });

  test('keeps the pipe-separated params of a real NFC-e QR payload', () => {
    const url = 'http://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?p=3126|2|1|1|ABCDEF0123';
    assert.equal(extractUrlFromQrData(url), url);
  });

  test('finds the URL inside surrounding text and ignores the scheme case', () => {
    assert.equal(extractUrlFromQrData('QR: HTTPS://exemplo.gov.br/x?y=1 fim'), 'HTTPS://exemplo.gov.br/x?y=1');
  });

  test('throws a user-facing error when there is no URL', () => {
    assert.throws(() => extractUrlFromQrData('3126091234500012345'), /não contém uma URL válida/);
    assert.throws(() => extractUrlFromQrData(''), /não contém uma URL válida/);
  });
});

describe('stripScriptsAndStyles', () => {
  test('removes scripts, styles, comments and inline base64 data, keeps content', () => {
    const out = stripScriptsAndStyles(
      '<style>a{}</style><script>alert(1)</script><!-- c --><img src="data:image/png;base64,AAAA="><p>Olá</p>'
    );
    assert.ok(!out.includes('alert'));
    assert.ok(!out.includes('a{}'));
    assert.ok(!out.includes('<!--'));
    assert.ok(!out.includes('AAAA'));
    assert.ok(out.includes('data:[omitido]'));
    assert.ok(out.includes('<p>Olá</p>'));
  });

  test('caps oversized pages so the share sheet does not choke', () => {
    const out = stripScriptsAndStyles('<p>' + 'x'.repeat(400_000) + '</p>');
    assert.ok(out.length < 151_000, `got ${out.length}`);
    assert.match(out, /truncado/);
  });

  test('leaves a small page untouched apart from trimming', () => {
    assert.equal(stripScriptsAndStyles('  <p>ok</p>  '), '<p>ok</p>');
  });
});

describe('parseNfceHtml — current Sefaz-MG layout', () => {
  const parsed = parseNfceHtml(fixture('current-layout.html'));

  test('extracts every item with decoded names', () => {
    assert.deepEqual(
      parsed.items.map((i) => i.description),
      ['LEITE UHT INTEGRAL 1L', 'ARROZ & FEIJÃO KIT', 'BANANA PRATA KG']
    );
  });

  test('derives unit value from line total / quantity, in any decimal format', () => {
    const [leite, arroz, banana] = parsed.items;
    assert.equal(leite.quantity, 2);
    assert.equal(leite.unitValue, 5.99);
    assert.equal(arroz.quantity, 1);
    assert.equal(arroz.unitValue, 1234.56); // "1.234,56": BR thousands + comma
    assert.equal(banana.quantity, 0.485); // "0.4850": dot decimal, fractional kg
    assert.ok(Math.abs(banana.unitValue - 3.88 / 0.485) < 1e-9);
  });

  test('reads the total (dot-decimal in the totals block)', () => {
    assert.equal(parsed.totalValue, 1250.42);
  });

  test('items add up to the total on a consistent coupon', () => {
    const sum = parsed.items.reduce((acc, i) => acc + i.quantity * i.unitValue, 0);
    assert.ok(Math.abs(sum - parsed.totalValue) < 0.005, `sum=${sum} total=${parsed.totalValue}`);
  });

  test('ignores look-alike text inside <script>/<style>', () => {
    // the fixture plants "Valor total R$: R$ 999,99" / "888,88" in style/script
    assert.notEqual(parsed.totalValue, 999.99);
    assert.notEqual(parsed.totalValue, 888.88);
    assert.equal(parsed.items.length, 3);
  });

  test('purchase date is the emission date at local midnight', () => {
    const d = new Date(parsed.purchaseDate);
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 8, 21]);
    assert.deepEqual([d.getHours(), d.getMinutes()], [0, 0]);
  });
});

describe('parseNfceHtml — current layout edge cases', () => {
  test('plain dot-decimal totals like "572.90" are not read as thousands', () => {
    const p = parseNfceHtml(currentLayout([row('ITEM', '1.0000', '5,99')], '572.90'));
    assert.equal(p.totalValue, 572.9);
  });

  test('falls back to "now" when the page carries no emission date', () => {
    const p = parseNfceHtml(currentLayout([row('ITEM', '1.0000', '5,99')], '5.99', 'sem data'));
    assert.ok(Math.abs(Date.now() - new Date(p.purchaseDate).getTime()) < 5_000);
  });

  test('skips a row with zero quantity but keeps the valid ones', () => {
    const p = parseNfceHtml(
      currentLayout([row('FANTASMA', '0.0000', '0,00'), row('REAL', '1.0000', '7,50')], '7.50')
    );
    assert.deepEqual(p.items.map((i) => i.description), ['REAL']);
  });

  test('accepts both spellings of "ítens/itens"', () => {
    const html = currentLayout(['<tr><td><h7>X</h7>Qtde total de itens: 3.0000 Valor total R$: R$ 9,00</td></tr>'], '9.00');
    assert.equal(parseNfceHtml(html).items[0].unitValue, 3);
  });

  test('throws when items are present but the total cannot be found', () => {
    assert.throws(
      () => parseNfceHtml(currentLayout([row('ITEM', '1.0000', '5,99')], null)),
      /valor total/
    );
  });

});

describe('findTotalMismatch', () => {
  test('a consistent coupon has no mismatch', () => {
    assert.equal(findTotalMismatch(parseNfceHtml(fixture('current-layout.html'))), null);
    assert.equal(findTotalMismatch(parseNfceHtml(fixture('legacy-layout.html'))), null);
  });

  test('tolerates a few cents of rounding drift', () => {
    const p = parseNfceHtml(currentLayout([row('ITEM', '1.0000', '10,00')], '10.03'));
    assert.equal(findTotalMismatch(p), null);
  });

  test('catches a row the parser silently skipped (items add up to less than the total)', () => {
    // 2nd row has no readable value, so the parser drops it but the coupon total still counts it
    const broken = '<tr><td><h7>ILEGIVEL</h7>Qtde total de ítens: 1.0000</td></tr>';
    const p = parseNfceHtml(currentLayout([row('LEITE', '1.0000', '6,00'), broken], '14.00'));
    assert.equal(p.items.length, 1);
    assert.deepEqual(findTotalMismatch(p), { itemsSum: 6, totalValue: 14 });
  });

  test('reports a discount as a mismatch too — the caller decides what to do', () => {
    const p = parseNfceHtml(currentLayout([row('LEITE', '1.0000', '20,00')], '15.00'));
    assert.deepEqual(findTotalMismatch(p), { itemsSum: 20, totalValue: 15 });
  });
});

describe('parseNfceHtml — legacy layout fallback', () => {
  test('parses the old txtTit/Rqtd/RvlUnit template', () => {
    const p = parseNfceHtml(fixture('legacy-layout.html'));
    assert.deepEqual(
      p.items.map((i) => [i.description, i.quantity, i.unitValue]),
      [
        ['CAFE TORRADO 500G', 2, 15.9],
        ['ACUCAR 1KG', 1, 4.5],
      ]
    );
    assert.equal(p.totalValue, 36.3);
    const d = new Date(p.purchaseDate);
    assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2025, 2, 5]);
  });

  test('throws when the legacy page has no total', () => {
    const html = fixture('legacy-layout.html').replace(/<span id="valorTotal">.*<\/span>/, '');
    assert.throws(() => parseNfceHtml(html), /valor total/);
  });

  test('throws when item name/quantity/unit counts disagree', () => {
    const html = fixture('legacy-layout.html').replace(/<span class="RvlUnit">Vl\. Unit\.: 4,50<\/span>/, '');
    assert.throws(() => parseNfceHtml(html), /interpretar os itens/);
  });
});

describe('parseNfceHtml — pages that are not a receipt', () => {
  test('a Cloudflare/challenge page throws instead of returning an empty purchase', () => {
    const html = '<html><body><h1>Verificando se você é humano…</h1></body></html>';
    assert.throws(() => parseNfceHtml(html), /interpretar os itens/);
  });

  test('empty string throws', () => {
    assert.throws(() => parseNfceHtml(''), /interpretar os itens/);
  });
});
