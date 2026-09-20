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
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBrNumber(raw: string): number {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : NaN;
}

function brDateToIso(br: string): string {
  const [d, m, y] = br.split('/');
  return new Date(`${y}-${m}-${d}T00:00:00`).toISOString();
}

/**
 * Parses the NFC-e consulta result DOM (Sefaz-MG), captured from the WebView
 * after the user gets past the Cloudflare challenge and taps "Visualizar" —
 * a plain fetch() never sees this markup, since the portal only renders it
 * after that challenge. Layout follows the common "Portal NFC-e" template
 * shared across states: item name/code in spans with class txtTit/RCod,
 * quantity/unit value/line total in spans with class Rqtd/RvlUnit/valor,
 * inside a #tabResult table.
 */
export function parseNfceHtml(html: string): ParsedNfce {
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
