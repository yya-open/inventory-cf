import { errorResponse } from "../../../_auth";
import { DELETE_ORDER, TABLE_COLUMNS } from "../_backup_schema";
import { Inflate } from 'pako';

export { DELETE_ORDER, TABLE_COLUMNS };

export function pick(obj: any, cols: string[]) {
  return cols.map((c) => (obj?.[c] === undefined ? null : obj[c]));
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseJsonSafe<T = any>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return fallback;
  }
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

// Streaming row iterator, yielding per-row JSON text.
// NOTE: supports backup v1 (top-level `tables`) and backup v2+ (top-level `data`).
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
        // v1: "tables": { ... }
        // v2+: "data": { ... }
        const idxTables = buf.indexOf('"tables"', i);
        const idxData = buf.indexOf('"data"', i);
        let idx = -1;
        let keyLen = 0;
        if (idxTables !== -1 && idxData !== -1) {
          idx = Math.min(idxTables, idxData);
          keyLen = (idx === idxTables) ? '"tables"'.length : '"data"'.length;
        } else if (idxTables !== -1) {
          idx = idxTables;
          keyLen = '"tables"'.length;
        } else if (idxData !== -1) {
          idx = idxData;
          keyLen = '"data"'.length;
        }

        if (idx === -1) {
          buf = buf.slice(Math.max(0, buf.length - 64));
          i = 0;
          break;
        }

        i = idx + keyLen;
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
  // Cloudflare runtime may not provide DecompressionStream in all environments.
  // When gzip=true, always try to decompress:
  // 1) use native DecompressionStream when available;
  // 2) otherwise fallback to pako streaming gunzip.
  if (gzip && typeof (globalThis as any).DecompressionStream !== "undefined") {
    s = s.pipeThrough(new DecompressionStream("gzip"));
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
    return;
  }

  if (gzip) {
    const infl = new Inflate({ to: 'string' });
    const reader = s.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length) {
          infl.push(value, false);
          if (infl.err) throw new Error(infl.msg || 'gzip 解压失败');
          const out: any = infl.result;
          if (out) {
            // pako may return string or string[] depending on internal chunking.
            if (Array.isArray(out)) {
              for (const part of out) if (part) yield String(part);
            } else {
              yield String(out);
            }
          }
        }
      }
      infl.push(new Uint8Array(0), true);
      if (infl.err) throw new Error(infl.msg || 'gzip 解压失败');
      const out: any = infl.result;
      if (out) {
        if (Array.isArray(out)) {
          for (const part of out) if (part) yield String(part);
        } else {
          yield String(out);
        }
      }
    } finally {
      try { reader.releaseLock(); } catch {}
    }
    return;
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
        const idxTables = buf.indexOf('"tables"', i);
        const idxData = buf.indexOf('"data"', i);
        let idx = -1;
        let keyLen = 0;
        if (idxTables !== -1 && idxData !== -1) {
          idx = Math.min(idxTables, idxData);
          keyLen = (idx === idxTables) ? '"tables"'.length : '"data"'.length;
        } else if (idxTables !== -1) {
          idx = idxTables;
          keyLen = '"tables"'.length;
        } else if (idxData !== -1) {
          idx = idxData;
          keyLen = '"data"'.length;
        }

        if (idx === -1) {
          buf = buf.slice(Math.max(0, buf.length - 64));
          i = 0;
          break;
        }
        i = idx + keyLen;
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

// Iterate table keys under top-level "tables" (v1) or "data" (v2+) object, even when the table array is empty.
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
        const idxTables = buf.indexOf('"tables"', i);
        const idxData = buf.indexOf('"data"', i);
        let idx = -1;
        let keyLen = 0;
        if (idxTables !== -1 && idxData !== -1) {
          idx = Math.min(idxTables, idxData);
          keyLen = (idx === idxTables) ? '"tables"'.length : '"data"'.length;
        } else if (idxTables !== -1) {
          idx = idxTables;
          keyLen = '"tables"'.length;
        } else if (idxData !== -1) {
          idx = idxData;
          keyLen = '"data"'.length;
        }

        if (idx === -1) {
          buf = buf.slice(Math.max(0, buf.length - 64));
          i = 0;
          break;
        }
        i = idx + keyLen;
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
