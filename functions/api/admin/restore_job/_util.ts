import { errorResponse } from "../../../_auth";

export const TABLE_COLUMNS: Record<string, string[]> = {
  warehouses: ["id","name","created_at"],
  items: ["id","sku","name","brand","model","category","unit","warning_qty","enabled","created_at"],
  stock: ["id","item_id","warehouse_id","qty","updated_at"],
  stock_tx: ["id","tx_no","type","item_id","warehouse_id","qty","delta_qty","ref_type","ref_id","ref_no","unit_price","source","target","remark","created_at","created_by"],
  users: ["id","username","password_hash","role","is_active","must_change_password","token_version","created_at"],
  auth_login_throttle: ["id","ip","username","fail_count","first_fail_at","last_fail_at","locked_until","updated_at"],
  audit_log: ["id","user_id","username","action","entity","entity_id","payload_json","ip","ua","created_at"],
  stocktake: ["id","st_no","warehouse_id","status","created_at","created_by","applied_at"],
  stocktake_line: ["id","stocktake_id","item_id","system_qty","counted_qty","diff_qty","updated_at"],
  pc_assets: ["id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","status","qr_key","qr_updated_at","created_at","updated_at"],
  pc_in: ["id","in_no","asset_id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","created_at","created_by"],
  pc_out: ["id","out_no","asset_id","employee_no","department","employee_name","is_employed","brand","serial_no","model","config_date","manufacture_date","warranty_end","disk_capacity","memory_size","remark","recycle_date","created_at","created_by"],
  pc_recycle: ["id","recycle_no","action","asset_id","employee_no","department","employee_name","is_employed","brand","serial_no","model","recycle_date","remark","created_at","created_by"],
  pc_scrap: ["id","scrap_no","asset_id","brand","serial_no","model","manufacture_date","warranty_end","disk_capacity","memory_size","remark","scrap_date","reason","created_at","created_by"],
  pc_inventory_log: ["id","asset_id","action","issue_type","remark","ip","ua","created_at"],
  pc_locations: ["id","name","parent_id","enabled","created_at"],
  monitor_assets: ["id","asset_code","qr_key","qr_updated_at","sn","brand","model","size_inch","remark","status","location_id","employee_no","department","employee_name","is_employed","created_at","updated_at"],
  monitor_tx: ["id","tx_no","tx_type","asset_id","asset_code","sn","brand","model","size_inch","from_location_id","to_location_id","employee_no","department","employee_name","is_employed","remark","created_at","created_by","ip","ua"],
  monitor_inventory_log: ["id","asset_id","action","issue_type","remark","ip","ua","created_at"],
  public_api_throttle: ["k","count","updated_at"],
};

export const DELETE_ORDER = [
  "stocktake_line",
  "stocktake",
  "monitor_inventory_log",
  "monitor_tx",
  "monitor_assets",
  "pc_inventory_log",
  "pc_scrap",
  "pc_recycle",
  "pc_out",
  "pc_in",
  "pc_assets",
  "pc_locations",
  "stock_tx",
  "stock",
  "items",
  "warehouses",
  "audit_log",
  "auth_login_throttle",
  "public_api_throttle",
  "users",
];

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

export function nowIso() {
  return new Date().toISOString();
}

// multipart helpers
export function isLikelyGzipFilename(name: string) {
  const n = (name || "").toLowerCase();
  return n.endsWith(".gz") || n.endsWith(".gzip");
}

function isGzipMagicBytes(bytes?: Uint8Array | null) {
  return !!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

export async function sniffGzipFromFile(file: File) {
  try {
    const ab = await file.slice(0, 2).arrayBuffer();
    return isGzipMagicBytes(new Uint8Array(ab));
  } catch {
    // Fallback to filename when slice/arrayBuffer is not available.
    return isLikelyGzipFilename((file as any)?.name || "");
  }
}

/**
 * Read the first chunk of a stream to detect gzip magic bytes, then return a new stream that
 * replays that chunk + the rest of the original stream.
 */
export async function sniffGzipFromStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const first = await reader.read();
  const firstChunk = first?.value;
  const gzip = isGzipMagicBytes(firstChunk);

  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      if (firstChunk && firstChunk.length) controller.enqueue(firstChunk);
      const pump = () => {
        reader.read().then(({ value, done }) => {
          if (done) {
            controller.close();
            return;
          }
          if (value) controller.enqueue(value);
          pump();
        }).catch((err) => controller.error(err));
      };
      pump();
    },
    cancel(reason) {
      try { reader.cancel(reason); } catch {}
    }
  });

  return { stream: replay, gzip };
}

export async function* textChunksFromFile(file: File, forceGzip?: boolean) {
  let s: ReadableStream<Uint8Array> = file.stream();

  // Do NOT rely on filename to decide gzip; browsers may transparently decompress downloads.
  const wantGzip = (typeof forceGzip === "boolean") ? forceGzip : await sniffGzipFromFile(file);

  if (wantGzip) {
    if (typeof (globalThis as any).DecompressionStream === "undefined") {
      throw new Error("当前环境不支持 gzip 解压，请上传 .json 备份或在支持 DecompressionStream 的环境中操作");
    }
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

// Same streaming row iterator as restore_upload.ts, yielding per-row JSON text.
// NOTE: this parser assumes the backup is generated by this project (tables object, arrays of objects).
export async function* iterBackupRows(file: File): AsyncGenerator<{ table: string; rowText: string }, void, unknown> {
  const skipWS = (buf: string, i: number) => {
    while (i < buf.length) {
      const c = buf[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") i++;
      else break;
    }
    return i;
  };

  const readJsonString = (buf: string, i: number) => {
    i++; // skip opening quote
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

  let objStart = -1;
  let depth = 0;
  let objInString = false;
  let objEscape = false;

  // We accept .json OR .json.gz; if gzip not supported, user should upload plain json.
  for await (const chunk of textChunksFromFile(file)) {
    buf += chunk;
    let i = 0;

    while (i < buf.length) {
      if (state === "seek_tables") {
        const idx = buf.indexOf('"tables"', i);
        if (idx === -1) {
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
        if (buf[i] === "}") return;
        if (buf[i] === ",") { i++; continue; }
        if (buf[i] !== '"') { i++; continue; }

        const r = readJsonString(buf, i);
        if (!r) break;
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
        objStart = -1;
        depth = 0;
        objInString = false;
        objEscape = false;
        continue;
      }

      if (state === "in_array") {
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
          } else {
            i++;
            continue;
          }
        }

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
                const rowText = buf.slice(objStart, i + 1);
                yield { table: curTable, rowText };
                objStart = -1;
                i++; // past }
                break;
              }
            }
          }
        }

        if (objStart !== -1) {
          buf = buf.slice(objStart);
          i = 0;
          objStart = 0;
          break;
        }

        if (i > 4096) {
          buf = buf.slice(i);
          i = 0;
        }
        continue;
      }

      i++;
    }
  }
}


export async function* textChunksFromStream(stream: ReadableStream<Uint8Array>, gzip?: boolean) {
  let s: ReadableStream<Uint8Array> = stream;
  if (gzip && typeof (globalThis as any).DecompressionStream !== "undefined") {
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

export async function* iterBackupRowsFromStream(stream: ReadableStream<Uint8Array>, gzip?: boolean) {
  const skipWS = (buf: string, i: number) => {
    while (i < buf.length) {
      const c = buf[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") i++;
      else break;
    }
    return i;
  };

  const readJsonString = (buf: string, i: number) => {
    i++; // skip opening quote
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

  let objStart = -1;
  let depth = 0;
  let objInString = false;
  let objEscape = false;

  for await (const chunk of textChunksFromStream(stream, gzip)) {
    buf += chunk;
    let i = 0;

    while (i < buf.length) {
      if (state === "seek_tables") {
        const idx = buf.indexOf('"tables"', i);
        if (idx === -1) {
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
        if (buf[i] === "}") return;
        if (buf[i] === ",") { i++; continue; }
        if (buf[i] !== '"') { i++; continue; }

        const r = readJsonString(buf, i);
        if (!r) break;
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
        objStart = -1;
        depth = 0;
        objInString = false;
        objEscape = false;
        continue;
      }

      if (state === "in_array") {
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
          } else {
            i++;
            continue;
          }
        }

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
                const rowText = buf.slice(objStart, i + 1);
                yield { table: curTable, rowText };
                objStart = -1;
                i++;
                break;
              }
            }
          }
        }

        if (objStart !== -1) {
          buf = buf.slice(objStart);
          i = 0;
          objStart = 0;
          break;
        }

        if (i > 4096) {
          buf = buf.slice(i);
          i = 0;
        }
        continue;
      }

      i++;
    }
  }
}

// Iterate table keys under top-level "tables" object, even when the table array is empty.
// This lets UI distinguish between "table not included in backup" vs "included but 0 rows".
export async function* iterBackupTableKeysFromStream(stream: ReadableStream<Uint8Array>, gzip?: boolean) {
  const skipWS = (buf: string, i: number) => {
    while (i < buf.length) {
      const c = buf[i];
      if (c === " " || c === "\n" || c === "\r" || c === "\t") i++;
      else break;
    }
    return i;
  };

  const readJsonString = (buf: string, i: number) => {
    i++; // skip opening quote
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
  let state: "seek_tables" | "seek_table_key" | "seek_array_start" = "seek_tables";
  const yielded = new Set<string>();

  for await (const chunk of textChunksFromStream(stream, gzip)) {
    buf += chunk;
    let i = 0;

    while (i < buf.length) {
      if (state === "seek_tables") {
        const idx = buf.indexOf('"tables"', i);
        if (idx === -1) {
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
        if (buf[i] === "}") return;
        if (buf[i] === ",") { i++; continue; }
        if (buf[i] !== '"') { i++; continue; }

        const r = readJsonString(buf, i);
        if (!r) break;
        const table = r.value;
        if (table && !yielded.has(table)) {
          yielded.add(table);
          yield table;
        }
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

        let depth = 0;
        let inStr = false;
        let esc = false;
        for (; i < buf.length; i++) {
          const ch = buf[i];
          if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === "\\") { esc = true; continue; }
            if (ch === '"') { inStr = false; continue; }
            continue;
          }
          if (ch === '"') { inStr = true; continue; }
          if (ch === "[") depth++;
          if (ch === "]") {
            depth--;
            if (depth === 0) { i++; break; }
          }
        }

        if (depth !== 0) {
          buf = buf.slice(Math.max(0, i - 4096));
          i = 0;
          break;
        }
        state = "seek_table_key";
        continue;
      }

      i++;
    }
  }
}
