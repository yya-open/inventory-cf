import * as XLSX from "xlsx";

/** Export array of plain objects to xlsx with ordered headers (Chinese titles). */
export function exportToXlsx(options: {
  filename: string;
  headers: { key: string; title: string }[];
  rows: any[];
  sheetName?: string;
}) {
  const { filename, headers, rows, sheetName } = options;

  const data = rows.map((r) => {
    const o: any = {};
    headers.forEach((h) => (o[h.title] = r?.[h.key] ?? ""));
    return o;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.title) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename);
}

/** Create a template xlsx file with headers and optional example rows */
export function downloadTemplate(options: {
  filename: string;
  headers: { title: string }[];
  exampleRows?: Record<string, any>[];
  sheetName?: string;
}) {
  const { filename, headers, exampleRows, sheetName } = options;
  const data = (exampleRows && exampleRows.length ? exampleRows : [{}]).map((r) => {
    const o: any = {};
    headers.forEach((h) => (o[h.title] = r?.[h.title] ?? ""));
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers.map((h) => h.title) });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "Sheet1");
  XLSX.writeFile(wb, filename);
}

export async function parseXlsx(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, any>[];
  return rows;
}
