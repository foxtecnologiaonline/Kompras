export interface ParsedNfceItem {
  description: string;
  unitValue: number;
  quantity: number;
}

export interface ParsedNfce {
  items: ParsedNfceItem[];
  totalValue: number;
  purchaseDate: string; // ISO string
}

export function extractUrlFromQrData(data: string): string {
  const match = data.match(/https?:\/\/\S+/i);
  if (!match) {
    throw new Error('QR Code não contém uma URL válida de NFC-e.');
  }
  return match[0];
}

// Android's share intent has a binder transaction limit (roughly 1MB,
// often less depending on the receiving app); a captured page can carry
// megabytes of inline base64 assets or third-party script noise well past
// that, which would make Share.share silently fail. Keep the shared text
// small and comfortably under that ceiling.
const MAX_DEBUG_HTML_LENGTH = 150_000;

/** Trims boilerplate (scripts/styles/comments/inline data URIs) and caps the
 * length so the raw HTML is safe to hand to the native share sheet. */
export function stripScriptsAndStyles(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/data:[a-z0-9/+.;=-]+;base64,[a-z0-9+/=]+/gi, 'data:[omitido]')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  if (cleaned.length <= MAX_DEBUG_HTML_LENGTH) {
    return cleaned;
  }
  return `${cleaned.slice(0, MAX_DEBUG_HTML_LENGTH)}\n\n[...truncado, ${cleaned.length - MAX_DEBUG_HTML_LENGTH} caracteres a mais...]`;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBrNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

// The portal isn't consistent about decimal separator: item line totals read
// "R$ 5,99" (BR comma) while the page's own running totals and quantities
// read "572.90" / "1.0000" (plain dot). Pick the right parse by what's
// actually in the string instead of assuming one format.
function parseMoney(raw: string): number {
  const cleaned = raw.trim();
  return cleaned.includes(',') ? parseBrNumber(cleaned) : parseFloat(cleaned);
}

function brDateToIso(br: string): string {
  const [d, m, y] = br.split('/');
  return new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
}

// Current Sefaz-MG "Portal NFC-e" template (as of 2026): items live in
// <tbody id="myTable"> rows, name in a <h7> tag, quantity/value as plain
// text ("Qtde total de ítens: 1.0000" / "Valor total R$: R$ 5,99").
function parseCurrentLayoutItems(html: string): ParsedNfceItem[] {
  const tbodyMatch = html.match(/<tbody[^>]*\bid="myTable"[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return [];

  const rows = tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/gi) ?? [];
  const items: ParsedNfceItem[] = [];
  for (const row of rows) {
    const nameMatch = row.match(/<h7>([\s\S]*?)<\/h7>/i);
    const qtyMatch = row.match(/Qtde total de [ií]tens:\s*([\d.,]+)/i);
    const valueMatch = row.match(/Valor total R\$:\s*R\$\s*([\d.,]+)/i);
    if (!nameMatch || !qtyMatch || !valueMatch) continue;

    const description = stripTags(nameMatch[1]);
    const quantity = parseMoney(qtyMatch[1]);
    const lineTotal = parseMoney(valueMatch[1]);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(lineTotal)) {
      continue;
    }
    items.push({ description, quantity, unitValue: lineTotal / quantity });
  }
  return items;
}

function parseCurrentLayoutTotal(html: string): number {
  const match = html.match(/Valor total R\$\s*<\/strong>[\s\S]{0,200}?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  return match ? parseMoney(match[1]) : NaN;
}

function parseCurrentLayoutDate(html: string): string | null {
  const match = html.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}/);
  return match ? brDateToIso(match[1]) : null;
}

// Older Sefaz-MG template, kept as a fallback in case a cached/alternate
// page still serves it: item name/code in spans with class txtTit/RCod,
// quantity/unit value in spans with class Rqtd/RvlUnit, inside a
// #tabResult table.
function parseLegacyLayout(html: string): ParsedNfce {
  const nameRegex = /class="[^"]*\btxtTit\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g;
  const qtyRegex = /class="[^"]*\bRqtd\b[^"]*"[^>]*>\s*Qtde\.?:?\s*([\d.,]+)/gi;
  const unitRegex = /class="[^"]*\bRvlUnit\b[^"]*"[^>]*>\s*Vl\.?\s*Unit\.?:?\s*([\d.,]+)/gi;

  const names: string[] = [];
  const quantities: number[] = [];
  const unitValues: number[] = [];

  let m: RegExpExecArray | null;
  while ((m = nameRegex.exec(html))) {
    const name = stripTags(m[1]);
    if (name) names.push(name);
  }
  while ((m = qtyRegex.exec(html))) {
    quantities.push(parseBrNumber(m[1]));
  }
  while ((m = unitRegex.exec(html))) {
    unitValues.push(parseBrNumber(m[1]));
  }

  if (
    names.length === 0 ||
    names.length !== quantities.length ||
    names.length !== unitValues.length ||
    quantities.some(Number.isNaN) ||
    unitValues.some(Number.isNaN)
  ) {
    throw new Error('Não foi possível interpretar os itens do cupom fiscal.');
  }

  const items: ParsedNfceItem[] = names.map((description, i) => ({
    description,
    quantity: quantities[i],
    unitValue: unitValues[i],
  }));

  const totalMatch =
    html.match(/id="[^"]*valorTotal[^"]*"[^>]*>\s*(?:R\$)?\s*([\d.,]+)/i) ??
    html.match(/Valor\s+total\s*R?\$?\s*([\d.,]+)/i);
  const totalValue = totalMatch ? parseBrNumber(totalMatch[1]) : NaN;
  if (Number.isNaN(totalValue)) {
    throw new Error('Não foi possível interpretar o valor total do cupom fiscal.');
  }

  const dateMatch = html.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const purchaseDate = dateMatch ? brDateToIso(dateMatch[1]) : new Date().toISOString();

  return { items, totalValue, purchaseDate };
}

/**
 * Parses the NFC-e consulta result DOM (Sefaz-MG), captured from the WebView
 * after the user gets past the Cloudflare challenge and taps "Visualizar" —
 * a plain fetch() never sees this markup, since the portal only renders it
 * after that challenge. Tries the current portal template first, falling
 * back to an older one Sefaz-MG has used in the past.
 */
export function parseNfceHtml(html: string): ParsedNfce {
  const items = parseCurrentLayoutItems(html);
  if (items.length > 0) {
    const totalValue = parseCurrentLayoutTotal(html);
    if (Number.isNaN(totalValue)) {
      throw new Error('Não foi possível interpretar o valor total do cupom fiscal.');
    }
    const purchaseDate = parseCurrentLayoutDate(html) ?? new Date().toISOString();
    return { items, totalValue, purchaseDate };
  }

  return parseLegacyLayout(html);
}
