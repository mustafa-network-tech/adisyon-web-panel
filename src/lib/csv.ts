/**
 * One CSV cell for the semicolon separated, Excel friendly exports.
 *
 * Spreadsheet programs run a cell as a formula when its text starts with = + - @ (or a tab / carriage return).
 * Names typed by users (products, categories, staff) end up in the exports, so such text gets a leading
 * apostrophe and is read as plain text. Numbers, and strings that are plain numbers such as "-12,50" (refunds),
 * are written unchanged so the figures stay usable in Excel.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(?:[.,]\d+)?$/;

export function csvCell(value: string | number): string {
  let text = String(value);
  if (typeof value === "string" && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
