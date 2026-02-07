import { json, requireAuth, errorResponse } from "../../_auth";
import { requireConfirm } from "../../_confirm";
import { logAudit } from "../_audit";

type RestoreMode = "merge" | "replace";

const TABLE_COLUMNS: Record<string, string[]> = {
  warehouses: ["id","name","created_at"],
  items: ["id","sku","name","brand","model","category","unit","warning_qty","enabled","created_at"],
  stock: ["id","item_id","warehouse_id","qty","updated_at"],
  stock_tx: ["id","tx_no","type","item_id","warehouse_id","qty","delta_qty","ref_type","ref_id","ref_no","unit_price","source","target","remark","created_at","created_by"],
  users: ["id","username","password_hash","role","is_active","must_change_password","created_at"],
  auth_login_throttle: ["id","ip","username","fail_count","first_fail_at","last_fail_at","locked_until","updated_at"],
  audit_log: ["id","user_id","username","action","entity","entity_id","payload_json","ip","ua","created_at"],
  stocktake: ["id","st_no","warehouse_id","status","created_at","created_by","applied_at"],
  stocktake_line: ["id","stocktake_id","item_id","system_qty","counted_qty","diff_qty","updated_at"],
};

const DELETE_ORDER = [
  "stocktake_line",
  "stocktake",
  "stock_tx",
  "stock",
  "items",
  "warehouses",
  "audit_log",
  "auth_login_throttle",
  "users",
];

function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

function isLikelyGzip(file: File) {
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".gz") || name.endsWith(".gzip");
}

async function* textChunksFromFile(file: File) {
  let s: ReadableStream<Uint8Array> = file.stream();
  if (isLikelyGzip(file) && typeof (globalThis as any).DecompressionStream !== "undefined") {
    s = s.pipeThrough(new DecompressionStream("gzip"));
  }
  const decoder = new TextDecoderStream();
  const reader = s.pipeThrough(decoder).getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

// A streaming parser for backups in the format:
// {"version":"...","exported_at":"...","tables":{"warehouses":[{...},{...}], "items":[...], ...}}
// It yields {table, rowText} where rowText is a JSON object string.
async function* iterBackupRows(file: File): AsyncGenerator<{ table: string; rowText: string }, void, unknown> {
  let inString = false;
  let escape = false;

  const skipWS = (buf: string, i: number) => {
    while (i < buf.length) {
      const c = buf[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") i++;
      else break;
    }
    return i;
  };

  // Read a JSON string starting at the first quote
  const readJsonString = (buf: string, i: number) => {
    // buf[i] must be '"'
    i++; // skip opening
    let out = "";
    let esc = false;
    while (i < buf.length) {
      const c = buf[i++];
      if (esc) {
        out += c;
        esc = false;
        continue;
      }
      if (c === "\\") {
        out += c;
        esc = true;
        continue;
      }
      if (c === '"') {
        return { value: JSON.parse(`"${out}"`), next: i };
      }
      out += c;
    }
    return null;
  };

  let buf = "";
  let state: "seek_tables" | "seek_table_key" | "seek_array_start" | "in_array" = "seek_tables";
  let curTable = "";

  // For object parsing inside array
  let objStart = -1;
  let depth = 0;
  let objInString = false;
  let objEscape = false;

  for await (const chunk of textChunksFromFile(file)) {
    buf += chunk;

    let i = 0;

    // incremental scanning
    while (i < buf.length) {
      if (state === "seek_tables") {
        const idx = buf.indexOf('"tables"', i);
        if (idx === -1) {
          // keep last few chars to handle boundary
          buf = buf.slice(Math.max(0, buf.length - 64));
          i = 0;
          break;
        }
        i = idx + '"tables"'.length;
        i = skipWS(buf, i);
        if (buf[i] !== ":") { i++; continue; }
        i++;
        i = skipWS(buf, i);
        if (buf[i] !== "{") { i++; continue; }
        i++;
        state = "seek_table_key";
        continue;
      }

      if (state === "seek_table_key") {
        i = skipWS(buf, i);
        if (i >= buf.length) break;
        if (buf[i] === "}") {
          // end tables object
          return;
        }
        if (buf[i] === ",") { i++; continue; }
        if (buf[i] !== '"') { i++; continue; }

        const r = readJsonString(buf, i);
        if (!r) break; // need more data
        curTable = r.value;
        i = r.next;
        state = "seek_array_start";
        continue;
      }

      if (state === "seek_array_start") {
        i = skipWS(buf, i);
        if (i >= buf.length) break;
        if (buf[i] !== ":") { i++; continue; }
        i++;
        i = skipWS(buf, i);
        if (i >= buf.length) break;
        if (buf[i] !== "[") { i++; continue; }
        i++;
        state = "in_array";
        // reset object parser
        objStart = -1;
        depth = 0;
        objInString = false;
        objEscape = false;
        continue;
      }

      if (state === "in_array") {
        // Parse objects until we hit ']'
        i = skipWS(buf, i);
        if (i >= buf.length) break;

        const c = buf[i];

        if (objStart === -1) {
          if (c === "]") {
            i++;
            state = "seek_table_key";
            continue;
          }
          if (c === ",") { i++; continue; }
          if (c === "{") {
            objStart = i;
            depth = 0;
            objInString = false;
            objEscape = false;
            // fallthrough to object scanning
          } else {
            // unexpected token; skip
            i++;
            continue;
          }
        }

        // object scanning
        for (; i < buf.length; i++) {
          const ch = buf[i];

          if (objInString) {
            if (objEscape) {
              objEscape = false;
              continue;
            }
            if (ch === "\\") {
              objEscape = true;
              continue;
            }
            if (ch === '"') {
              objInString = false;
              continue;
            }
            continue;
          } else {
            if (ch === '"') {
              objInString = true;
              continue;
            }
            if (ch === "{") depth++;
            if (ch === "}") {
              depth--;
              if (depth === 0) {
                // end of object at i
                const rowText = buf.slice(objStart, i + 1);
                yield { table: curTable, rowText };
                objStart = -1;
                i++; // move past }
                break;
              }
            }
          }
        }

        // if we reached end of buffer while still in object, keep remainder and read more
        if (objStart !== -1) {
          // keep from objStart onwards
          buf = buf.slice(objStart);
          i = 0;
          objStart = 0;
          break;
        }

        // shrink buffer occasionally to avoid unlimited growth
        if (i > 4096) {
          buf = buf.slice(i);
          i = 0;
        }
        continue;
      }

      i++;
    }
  }

  // If file ended unexpectedly
  return;
}

export const onRequestPost: PagesFunction<{ DB: D1Database; JWT_SECRET: string }> = async ({ env, request }) => {
  try {
    const actor = await requireAuth(env, request, "admin");

    const ct = request.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return Response.json({ ok: false, message: "请使用 multipart/form-data 上传备份文件" }, { status: 400 });
    }

    const form = await request.formData();
    const mode = (String(form.get("mode") || "merge") as RestoreMode) || "merge";
    const confirm = String(form.get("confirm") || "");
    requireConfirm({ mode, confirm } as any, mode === "replace" ? "清空并恢复" : "恢复", "二次确认不通过");

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json({ ok: false, message: "缺少 file" }, { status: 400 });
    }

    // Validate table names
    const allowTables = new Set(Object.keys(TABLE_COLUMNS));

    let insertedTotal = 0;
    const insertedByTable: Record<string, number> = {};

    // Start transaction (restore should be atomic)
    
    try {
      if (mode === "replace") {
        const stmts = DELETE_ORDER.map((t) => env.DB.prepare(`DELETE FROM ${t}`));
        await env.DB.batch(stmts);
      }

      let curTable = "";
      let curCols: string[] | null = null;
      let sql = "";
      let verb = mode === "merge" ? "INSERT OR IGNORE" : "INSERT OR REPLACE";
      let batch: D1PreparedStatement[] = [];
      let inserted = 0;

      const flush = async () => {
        if (!batch.length || !curTable) return;
        const res = await env.DB.batch(batch);
        for (const rr of res) inserted += Number((rr as any)?.meta?.changes ?? 0);
        batch = [];
      };

      for await (const { table, rowText } of iterBackupRows(file)) {
        if (!allowTables.has(table)) continue;

        if (table !== curTable) {
          // finish previous table
          await flush();
          if (curTable) {
            insertedByTable[curTable] = inserted;
            insertedTotal += inserted;
          }

          // start new table
          curTable = table;
          inserted = 0;
          curCols = TABLE_COLUMNS[table];
          const placeholders = curCols.map(() => "?").join(",");
          sql = `${verb} INTO ${table} (${curCols.join(",")}) VALUES (${placeholders})`;
        }

        // parse one row object and bind
        const obj = JSON.parse(rowText);
        const cols = curCols!;
        batch.push(env.DB.prepare(sql).bind(...pick(obj, cols)));
        if (batch.length >= 50) await flush();
      }

      // flush last table
      await flush();
      if (curTable) {
        insertedByTable[curTable] = inserted;
        insertedTotal += inserted;
      }

      } catch (err) {
      
      throw err;
    }

    await logAudit(env.DB, request, actor, "ADMIN_RESTORE_STREAM", "backup", null, {
      mode,
      filename: file.name || null,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    });

    return json(true, {
      mode,
      inserted_total: insertedTotal,
      inserted_by_table: insertedByTable,
    });
  } catch (e: any) {
    return errorResponse(e);
  }
};
