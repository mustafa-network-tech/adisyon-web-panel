/**
 * Line based formats the platform team uses to apply a business's setup
 * request. Each parser returns the rows or a Turkish error naming the line.
 *
 *   Salonlar:    one hall name per line
 *   Masalar:     "Salon adı: Masa 1, Masa 2, Masa 3-8 (4)"   (4 = capacity, optional)
 *                or the shorthand "Salon adı: 8 masa"
 *   İstasyonlar: "İstasyon adı" or "İstasyon adı: Kategori 1, Kategori 2"
 *   Menü:        "Kategori | Ürün | Fiyat | Açıklama | İstasyon"  (last two optional)
 */

export type ParseResult<T> = { ok: true; rows: T[] } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function lines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((item) => item.line.length > 0);
}

export function parseAreas(text: string): ParseResult<string> {
  const rows: string[] = [];
  for (const { line, number } of lines(text)) {
    if (line.length > 80) return fail(`Satır ${number}: salon adı en fazla 80 karakter olabilir.`);
    rows.push(line);
  }
  if (rows.length === 0) return fail("En az bir salon adı girin.");
  if (rows.length > 50) return fail("En fazla 50 salon eklenebilir.");
  return { ok: true, rows };
}

export type TableRow = { area: string; label: string; capacity: number };

/** "Masa 1-4" expands to Masa 1..Masa 4; a trailing "(6)" sets the capacity. */
function expandTableToken(token: string): { labels: string[]; capacity: number } | null {
  const capacityMatch = token.match(/\s*\((\d{1,3})\)\s*$/);
  const capacity = capacityMatch ? Number(capacityMatch[1]) : 2;
  const base = capacityMatch ? token.slice(0, capacityMatch.index).trim() : token.trim();
  if (!base || capacity < 1 || capacity > 500) return null;
  const range = base.match(/^(.*?)(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const [, prefix, from, to] = range;
    const start = Number(from);
    const end = Number(to);
    if (end < start || end - start > 199) return null;
    return { labels: Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${start + index}`.trim()), capacity };
  }
  return { labels: [base], capacity };
}

export function parseTables(text: string): ParseResult<TableRow> {
  const rows: TableRow[] = [];
  for (const { line, number } of lines(text)) {
    const colon = line.indexOf(":");
    if (colon < 1) return fail(`Satır ${number}: "Salon adı: Masa 1, Masa 2-5" biçiminde yazın.`);
    const area = line.slice(0, colon).trim();
    const rest = line.slice(colon + 1).trim();
    // Shorthand: "Salon: 8 masa" or "Salon: 8 (4)" = Salon 1 .. Salon 8.
    const count = rest.match(/^(\d{1,3})\s*(?:masa)?\s*(?:\((\d{1,3})\))?$/i);
    if (count) {
      const total = Number(count[1]);
      const capacity = count[2] ? Number(count[2]) : 2;
      if (total < 1 || total > 200 || capacity < 1 || capacity > 500) return fail(`Satır ${number}: masa sayısı veya kapasite geçersiz.`);
      for (let index = 1; index <= total; index += 1) rows.push({ area, label: `${area} ${index}`, capacity });
      continue;
    }
    const tokens = rest.split(",").map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 0) return fail(`Satır ${number}: en az bir masa yazın.`);
    for (const token of tokens) {
      const expanded = expandTableToken(token);
      if (!expanded) return fail(`Satır ${number}: "${token}" masa tanımı anlaşılamadı.`);
      for (const label of expanded.labels) {
        if (label.length > 40) return fail(`Satır ${number}: masa adı en fazla 40 karakter olabilir.`);
        rows.push({ area, label, capacity: expanded.capacity });
      }
    }
  }
  if (rows.length === 0) return fail("En az bir masa girin.");
  if (rows.length > 500) return fail("Tek seferde en fazla 500 masa eklenebilir.");
  return { ok: true, rows };
}

export type StationRow = { name: string; categories: string[] };

export function parseStations(text: string): ParseResult<StationRow> {
  const rows: StationRow[] = [];
  for (const { line, number } of lines(text)) {
    const colon = line.indexOf(":");
    const name = (colon === -1 ? line : line.slice(0, colon)).trim();
    const categories = colon === -1 ? [] : line.slice(colon + 1).split(",").map((item) => item.trim()).filter(Boolean);
    if (!name || name.length > 60) return fail(`Satır ${number}: istasyon adı 1-60 karakter olmalı.`);
    rows.push({ name, categories });
  }
  if (rows.length === 0) return fail("En az bir mutfak istasyonu girin.");
  if (rows.length > 20) return fail("En fazla 20 istasyon eklenebilir.");
  return { ok: true, rows };
}

export type MenuRow = { category: string; name: string; price_minor: number; description?: string; station?: string };

/** "365", "365,50", "1.250,00" -> minor units (kuruş); null when not a price. */
export function parsePriceMinor(value: string): number | null {
  const cleaned = value.replace(/\s|₺|TL/gi, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$|^\d+\.\d{1,2}$/.test(cleaned)) return null;
  const normalized = /,/.test(cleaned) ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return null;
  return Math.round(amount * 100);
}

export function parseMenu(text: string): ParseResult<MenuRow> {
  const rows: MenuRow[] = [];
  for (const { line, number } of lines(text)) {
    const parts = line.split("|").map((part) => part.trim());
    if (parts.length < 3) return fail(`Satır ${number}: "Kategori | Ürün | Fiyat" biçiminde yazın.`);
    const [category, name, price, description, station] = parts;
    const priceMinor = parsePriceMinor(price);
    if (!category || category.length > 80) return fail(`Satır ${number}: kategori adı 1-80 karakter olmalı.`);
    if (!name || name.length > 120) return fail(`Satır ${number}: ürün adı 1-120 karakter olmalı.`);
    if (priceMinor === null) return fail(`Satır ${number}: "${price}" geçerli bir fiyat değil.`);
    if (description && description.length > 500) return fail(`Satır ${number}: açıklama en fazla 500 karakter olabilir.`);
    rows.push({
      category,
      name,
      price_minor: priceMinor,
      ...(description ? { description } : {}),
      ...(station ? { station } : {}),
    });
  }
  if (rows.length === 0) return fail("En az bir ürün girin.");
  if (rows.length > 1000) return fail("Tek seferde en fazla 1000 ürün eklenebilir.");
  return { ok: true, rows };
}
