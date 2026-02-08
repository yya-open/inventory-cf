export type KeywordMode = "none" | "exact" | "prefix" | "contains";

function isDigits(s: string) {
  return /^\d+$/.test(s);
}

export type KeywordFields = {
  /** exact match fields, e.g. ["i.sku", "CAST(i.id AS TEXT)"] */
  exact?: string[];
  /** prefix match fields, e.g. ["i.sku", "i.name"] */
  prefix?: string[];
  /** contains match fields, e.g. ["i.name", "i.brand"] */
  contains?: string[];
  /** numeric id field (INTEGER) for digits-only keyword, e.g. "i.id" */
  numericId?: string;
};

export function buildKeywordWhere(keywordRaw: string, fields: KeywordFields) {
  const keyword = (keywordRaw || "").trim();
  if (!keyword) return { sql: "", binds: [] as any[], mode: "none" as KeywordMode };

  const parts: string[] = [];
  const binds: any[] = [];

  // 1) digits-only: try numericId and exact matches first
  if (isDigits(keyword)) {
    if (fields.numericId) {
      parts.push(`${fields.numericId} = ?`);
      binds.push(Number(keyword));
    }
    for (const col of fields.exact || []) {
      parts.push(`${col} = ?`);
      binds.push(keyword);
    }
    if (parts.length) {
      return { sql: `(${parts.join(" OR ")})`, binds, mode: "exact" as KeywordMode };
    }
  }

  // 2) short keywords: prefix-only to avoid full scans
  if (keyword.length <= 2) {
    const p2: string[] = [];
    for (const col of fields.prefix || []) {
      p2.push(`${col} LIKE ?`);
      binds.push(`${keyword}%`);
    }
    if (p2.length) return { sql: `(${p2.join(" OR ")})`, binds, mode: "prefix" as KeywordMode };
    return { sql: "", binds: [], mode: "none" as KeywordMode };
  }

  // 3) normal: prefix + limited contains
  const p3: string[] = [];
  for (const col of fields.prefix || []) {
    p3.push(`${col} LIKE ?`);
    binds.push(`${keyword}%`);
  }
  const c3: string[] = [];
  for (const col of fields.contains || []) {
    c3.push(`${col} LIKE ?`);
    binds.push(`%${keyword}%`);
  }
  const all = [...p3, ...c3];
  if (!all.length) return { sql: "", binds: [], mode: "none" as KeywordMode };
  return { sql: `(${all.join(" OR ")})`, binds, mode: (c3.length ? "contains" : "prefix") as KeywordMode };
}
