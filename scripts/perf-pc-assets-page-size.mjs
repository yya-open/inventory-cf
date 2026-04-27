import http from 'node:http';
import https from 'node:https';

function usage() {
  console.log('Usage: node scripts/perf-pc-assets-page-size.mjs <base-url> [cookie] [runs] [sizes]');
  console.log('Example: node scripts/perf-pc-assets-page-size.mjs "http://127.0.0.1:8788/api/pc-assets?fast=1" "auth=..." 12 "20,50,100"');
  console.log('Or use env: PERF_BASE_URL, PERF_COOKIE');
}

const baseUrl = String(process.argv[2] || process.env.PERF_BASE_URL || '').trim();
if (!baseUrl) {
  usage();
  process.exit(1);
}

const arg2 = String(process.argv[3] || '').trim();
const arg3 = String(process.argv[4] || '').trim();
const arg4 = String(process.argv[5] || '').trim();

let cookie = String(process.env.PERF_COOKIE || '').trim();
let runsRaw = '12';
let sizesRaw = '20,50,100';

if (/^\d+$/.test(arg2)) {
  runsRaw = arg2;
  if (arg3) sizesRaw = arg3;
} else {
  cookie = arg2 && arg2 !== '-' && arg2 !== '__NONE__' ? arg2 : cookie;
  if (arg3) runsRaw = arg3;
  if (arg4) sizesRaw = arg4;
}

const runs = Math.max(3, Number(runsRaw || 12));
const sizes = String(sizesRaw || '20,50,100')
  .split(',')
  .map((value) => Math.trunc(Number(value || 0)))
  .filter((value) => Number.isFinite(value) && value >= 20 && value <= 200);

if (!sizes.length) {
  console.error('Invalid page sizes. Expected comma-separated values between 20 and 200.');
  process.exit(2);
}

function parseServerTiming(headerValue) {
  const text = String(headerValue || '');
  const out = {};
  for (const part of text.split(',').map((s) => s.trim()).filter(Boolean)) {
    const segs = part.split(';').map((s) => s.trim());
    const name = segs[0];
    const durSeg = segs.find((seg) => seg.toLowerCase().startsWith('dur='));
    if (!name || !durSeg) continue;
    const dur = Number(durSeg.slice(4));
    if (Number.isFinite(dur)) out[name] = dur;
  }
  return out;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function requestOnce(url) {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const mod = isHttps ? https : http;
  const options = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  };

  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = mod.request(parsed, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        const body = Buffer.concat(chunks);
        resolve({
          status: Number(res.statusCode || 0),
          elapsedMs,
          bytes: body.byteLength,
          timing: parseServerTiming(res.headers['server-timing']),
          errorText: body.byteLength ? String(body.toString('utf8')).slice(0, 240) : '',
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeUrl(base, pageSize) {
  const url = new URL(base);
  url.searchParams.set('page', '1');
  url.searchParams.set('page_size', String(pageSize));
  if (!url.searchParams.get('fast')) url.searchParams.set('fast', '1');
  return url.toString();
}

async function runForSize(pageSize) {
  const url = makeUrl(baseUrl, pageSize);
  const records = [];

  // warm-up
  await requestOnce(url);

  for (let i = 0; i < runs; i += 1) {
    records.push(await requestOnce(url));
  }

  const ok = records.filter((record) => record.status >= 200 && record.status < 300);
  const fail = records.length - ok.length;
  const statusCounts = {};
  for (const record of records) {
    const key = String(record.status || 0);
    statusCounts[key] = Number(statusCounts[key] || 0) + 1;
  }
  const firstFailure = records.find((record) => !(record.status >= 200 && record.status < 300));
  const latency = ok.map((record) => record.elapsedMs);
  const bytes = ok.map((record) => record.bytes);
  const total = ok.map((record) => Number(record.timing.total || 0)).filter((value) => value > 0);
  const schema = ok.map((record) => Number(record.timing.schema || 0)).filter((value) => value > 0);
  const query = ok.map((record) => Number(record.timing.pc_assets_query || 0)).filter((value) => value > 0);

  return {
    page_size: pageSize,
    url,
    success: ok.length,
    failed: fail,
    status_counts: statusCounts,
    first_failure: firstFailure ? { status: firstFailure.status, body_preview: firstFailure.errorText } : null,
    latency_ms: {
      avg: Number(avg(latency).toFixed(2)),
      p50: Number(percentile(latency, 50).toFixed(2)),
      p95: Number(percentile(latency, 95).toFixed(2)),
      p99: Number(percentile(latency, 99).toFixed(2)),
    },
    response_bytes: {
      avg: Math.round(avg(bytes)),
      p50: Math.round(percentile(bytes, 50)),
      p95: Math.round(percentile(bytes, 95)),
    },
    server_timing_ms: {
      total: total.length ? { avg: Number(avg(total).toFixed(2)), p50: Number(percentile(total, 50).toFixed(2)), p95: Number(percentile(total, 95).toFixed(2)) } : null,
      schema: schema.length ? { avg: Number(avg(schema).toFixed(2)), p50: Number(percentile(schema, 50).toFixed(2)), p95: Number(percentile(schema, 95).toFixed(2)) } : null,
      pc_assets_query: query.length ? { avg: Number(avg(query).toFixed(2)), p50: Number(percentile(query, 50).toFixed(2)), p95: Number(percentile(query, 95).toFixed(2)) } : null,
    },
  };
}

function pickRecommendation(rows) {
  const candidates = rows.filter((row) => row.success > 0);
  if (!candidates.length) return null;
  const scored = candidates.map((row) => {
    const p95 = Number(row?.latency_ms?.p95 || 0);
    const sizeP95 = Number(row?.response_bytes?.p95 || 0);
    // prioritize latency, lightly penalize payload size
    const score = p95 + sizeP95 / 50000;
    return { page_size: row.page_size, score };
  }).sort((a, b) => a.score - b.score);
  return scored[0]?.page_size || null;
}

async function main() {
  const rows = [];
  for (const pageSize of sizes) {
    rows.push(await runForSize(pageSize));
  }
  const recommended = pickRecommendation(rows);
  console.log(JSON.stringify({
    base_url: baseUrl,
    auth_cookie_present: Boolean(cookie),
    runs,
    sizes,
    recommended_page_size: recommended,
    hint: recommended == null ? 'No successful responses. Check auth cookie / URL / permission.' : null,
    results: rows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(3);
});
