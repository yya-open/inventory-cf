import { throwHttpError } from '../_error';

// R2 / base64 / gzip 结果存储管道：与 async-jobs 生命周期、schema 探测、领域 handler 零耦合。
// 该模块不得反向 import async-jobs.ts（避免循环依赖）。

export type AsyncJobBuiltResult = {
  text?: string | null;
  blobBase64?: string | null;
  stream?: ReadableStream<Uint8Array> | null;
  fileSize?: number | null;
  filename: string;
  contentType: string;
  message: string;
  meta?: Record<string, any> | null;
};

export type AsyncJobResultBucket = {
  put: (key: string, value: any, options?: any) => Promise<any>;
  get: (key: string, options?: any) => Promise<any>;
  delete?: (key: string) => Promise<any>;
  createMultipartUpload?: (key: string, options?: any) => Promise<any>;
} | null | undefined;

const STREAM_UPLOAD_PART_BYTES = 5 * 1024 * 1024;
const STREAM_UPLOAD_FALLBACK_MAX_BYTES = 50 * 1024 * 1024;

export class AsyncJobCanceledError extends Error {
  constructor() {
    super('任务已取消');
    this.name = 'AsyncJobCanceledError';
  }
}

export function isAsyncJobCanceledError(error: any) {
  return error?.name === 'AsyncJobCanceledError';
}

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(value: any) {
  return utf8Encoder.encode(String(value ?? '')).length;
}

export function estimateBase64DecodedByteLength(input: any) {
  const base64 = String(input || '');
  if (!base64) return 0;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(base64.length * 3 / 4) - padding);
}

export function estimateBase64DecodedByteLengthByCharLength(base64Length: any) {
  const length = Math.max(0, Number(base64Length || 0));
  if (!length) return 0;
  return Math.floor((length * 3) / 4);
}

function encodeBytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function gzipTextToBase64(text: string) {
  if (typeof (globalThis as any).CompressionStream === 'undefined') {
    throw new Error('当前环境不支持 gzip 压缩');
  }
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(utf8Encoder.encode(text));
      controller.close();
    },
  }).pipeThrough(new CompressionStream('gzip') as any);
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return encodeBytesToBase64(new Uint8Array(arrayBuffer));
}

function decodeBase64ToBytes(input: any) {
  const base64 = String(input || '');
  if (!base64) return new Uint8Array();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function buildAsyncJobResultObjectKey(row: any, filename: string) {
  const safeName = String(filename || `job_${Number(row?.id || 0)}.dat`).replace(/[^a-zA-Z0-9._-]+/g, '_');
  const created = String(row?.created_at || '').replace(/[^0-9]/g, '').slice(0, 14) || String(Date.now());
  return `async-jobs/${created}/job_${Number(row?.id || 0)}/${safeName}`;
}

function buildAsyncJobResultPutOptions(contentType: string, filename: string) {
  return {
    httpMetadata: {
      contentType: String(contentType || 'application/octet-stream'),
      contentDisposition: `attachment; filename="${String(filename || 'download.dat').replace(/"/g, '')}"`,
      cacheControl: 'private, no-store, no-transform',
    },
  };
}

async function readReadableStreamToBytesWithLimit(stream: ReadableStream<Uint8Array>, limitBytes: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value || []);
      total += chunk.byteLength;
      if (total > limitBytes) throw new Error(`Stream result is too large to buffer (${limitBytes} bytes limit)`);
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function uploadReadableStreamObject(bucket: AsyncJobResultBucket, objectKey: string, stream: ReadableStream<Uint8Array>, options: any, shouldCancel?: () => Promise<boolean>) {
  if (!bucket) return null;
  if (typeof bucket.createMultipartUpload === 'function') {
    const upload = await bucket.createMultipartUpload(objectKey, options);
    const parts: any[] = [];
    const pendingChunks: Uint8Array[] = [];
    let pendingBytes = 0;
    let partNumber = 1;
    let fileSize = 0;
    const reader = stream.getReader();
    const takePendingBytes = (size: number) => {
      const body = new Uint8Array(size);
      let offset = 0;
      while (offset < size) {
        const head = pendingChunks[0];
        const need = size - offset;
        if (head.byteLength <= need) {
          body.set(head, offset);
          offset += head.byteLength;
          pendingChunks.shift();
        } else {
          body.set(head.subarray(0, need), offset);
          pendingChunks[0] = head.subarray(need);
          offset += need;
        }
      }
      pendingBytes -= size;
      return body;
    };
    const flushParts = async (force = false) => {
      while (pendingBytes >= STREAM_UPLOAD_PART_BYTES || (force && pendingBytes > 0)) {
        if (shouldCancel && await shouldCancel()) throw new AsyncJobCanceledError();
        const size = force ? pendingBytes : STREAM_UPLOAD_PART_BYTES;
        const body = takePendingBytes(size);
        const part = await upload.uploadPart(partNumber, body);
        parts.push(part);
        partNumber += 1;
        fileSize += body.byteLength;
      }
    };
    try {
      while (true) {
        if (shouldCancel && await shouldCancel()) throw new AsyncJobCanceledError();
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value || []);
        if (!chunk.byteLength) continue;
        pendingChunks.push(chunk);
        pendingBytes += chunk.byteLength;
        await flushParts(false);
      }
      await flushParts(true);
      reader.releaseLock();
      if (!parts.length) {
        await upload.abort().catch(() => {});
        await bucket.put(objectKey, new Uint8Array(), options);
        return { fileSize: 0 };
      }
      await upload.complete(parts);
      return { fileSize };
    } catch (error) {
      try { reader.releaseLock(); } catch {}
      try { await upload.abort(); } catch {}
      throw error;
    }
  }

  if (shouldCancel && await shouldCancel()) throw new AsyncJobCanceledError();
  const body = await readReadableStreamToBytesWithLimit(stream, STREAM_UPLOAD_FALLBACK_MAX_BYTES);
  if (shouldCancel && await shouldCancel()) throw new AsyncJobCanceledError();
  await bucket.put(objectKey, body, options);
  return { fileSize: body.byteLength };
}

export async function saveAsyncJobResultFile(bucket: AsyncJobResultBucket, row: any, result: AsyncJobBuiltResult, shouldCancel?: () => Promise<boolean>) {
  if (!bucket) return null;
  const filename = String(result.filename || `job_${Number(row?.id || 0)}.dat`);
  const objectKey = buildAsyncJobResultObjectKey(row, filename);
  const contentType = String(result.contentType || 'application/octet-stream');
  const putOptions = buildAsyncJobResultPutOptions(contentType, filename);
  if (result.stream != null) {
    const uploaded = await uploadReadableStreamObject(bucket, objectKey, result.stream as ReadableStream<Uint8Array>, putOptions, shouldCancel);
    return { objectKey, fileSize: result.fileSize != null ? Number(result.fileSize || 0) : uploaded?.fileSize ?? null };
  }
  if (shouldCancel && await shouldCancel()) throw new AsyncJobCanceledError();
  const body = result.stream != null
      ? result.stream
      : result.blobBase64 != null
        ? decodeBase64ToBytes(result.blobBase64)
        : String(result.text ?? '');
  await bucket.put(objectKey, body, putOptions);
  if (shouldCancel && await shouldCancel()) {
    if (typeof bucket.delete === 'function') await bucket.delete(objectKey).catch(() => {});
    throw new AsyncJobCanceledError();
  }
  const fileSize = result.fileSize != null
    ? Number(result.fileSize || 0)
    : result.blobBase64 != null
        ? estimateBase64DecodedByteLength(result.blobBase64)
        : result.stream != null
          ? null
          : utf8ByteLength(result.text ?? '');
  return { objectKey, fileSize };
}

async function loadAsyncJobStoredObject(bucket: AsyncJobResultBucket, row: any) {
  if (!bucket || !row?.result_object_key) return null;
  return await bucket.get(String(row.result_object_key));
}

export async function buildAsyncJobDownloadResponse(row: any, bucket: AsyncJobResultBucket, options: { inline?: boolean; print?: boolean } = {}) {
  if (String(row?.status) !== 'success') throwHttpError('任务尚未完成', 400);
  const hasObject = !!row?.result_object_key;
  const hasBlob = !!row?.result_blob_base64;
  const hasText = row?.result_text != null;
  if (!hasObject && !hasBlob && !hasText) {
    if (row?.result_deleted_at) throwHttpError('结果文件已过保留期，请重试重新生成', 410);
    throwHttpError('任务结果不可用', 400);
  }
  const filename = String(row?.result_filename || `job_${Number(row?.id || 0)}.txt`);
  const contentType = String(row?.result_content_type || 'text/plain; charset=utf-8');
  const headers: Record<string, string> = {
    'content-type': contentType,
    'content-disposition': `${options.inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    'cache-control': 'no-store, no-transform',
  };
  if (hasObject) {
    const obj = await loadAsyncJobStoredObject(bucket, row);
    if (!obj?.body) throwHttpError('结果文件不存在或已被删除', 410);
    return new Response(obj.body, { headers });
  }
  if (hasBlob) {
    return new Response(decodeBase64ToBytes(row.result_blob_base64), { headers });
  }
  let bodyText = String(row?.result_text || '');
  if (options.print && contentType.includes('text/html')) {
    const printScript = `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),120));</script>`;
    bodyText = /<\/body>/i.test(bodyText) ? bodyText.replace(/<\/body>/i, `${printScript}</body>`) : `${bodyText}${printScript}`;
  }
  return new Response(bodyText, { headers });
}
