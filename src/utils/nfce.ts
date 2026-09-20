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

const FETCH_TIMEOUT_MS = 15000;

export async function fetchNfceHtml(url: string, signal?: AbortSignal): Promise<string> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), FETCH_TIMEOUT_MS);
  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort);

  let response: Response;
  try {
    response = await fetch(url, { signal: timeoutController.signal });
  } catch (err) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (timeoutController.signal.aborted) {
      throw new Error('O cupom fiscal demorou demais para responder. Tente novamente.');
    }
    throw new Error('Falha de conexão ao buscar o cupom fiscal.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
  if (!response.ok) {
    throw new Error(`Falha ao buscar cupom fiscal (HTTP ${response.status}).`);
  }
  return response.text();
}

/** Trims boilerplate (scripts/styles) so the raw HTML is small enough to share for debugging. */
export function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
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
 * Parses the public NFC-e consulta HTML page (Sefaz-MG). The layout follows
 * the common "Portal NFC-e" template shared across states: item name/code in
 * spans with class txtTit/RCod, quantity/unit value/line total in spans with
 * class Rqtd/RvlUnit/valor, inside a #tabResult table.
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
