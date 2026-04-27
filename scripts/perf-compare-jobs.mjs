import http from 'node:http';
import https from 'node:https';

function usage() {
  console.log('Usage: node scripts/perf-compare-jobs.mjs <url> [runs] [cookie]');
  console.log('Example: node scripts/perf-compare-jobs.mjs "http://127.0.0.1:8788/api/jobs?limit=80&days=7" 20 "auth=..."');
}

const target = process.argv[2];
if (!target) {
  usage();
  process.exit(1);
}

const runs = Math.max(1, Number(process.argv[3] || 20));
const cookie = String(process.argv[4] || '').trim();

function parseServerTiming(headerValue) {
  const text = String(headerValue || '');
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  const out = {};
  for (const part of parts) {
    const segs = part.split(';').map((s) => s.trim());
    const name = segs[0];
    if (!name) continue;
    const durSeg = segs.find((s) => s.toLowerCase().startsWith('dur='));
    if (!durSeg) continue;
    const ms = Number(durSeg.slice(4));
    if (!Number.isFinite(ms)) continue;
    out[name] = ms;
  }
  return out;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function requestOnce(url) {
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  const options = {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  };
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = lib.request(parsed, options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const ended = process.hrtime.bigint();
        const elapsedMs = Number(ended - started) / 1_000_000;
        const body = Buffer.concat(chunks);
        resolve({
          status: Number(res.statusCode || 0),
          elapsedMs,
          responseBytes: body.byteLength,
          serverTiming: parseServerTiming(res.headers['server-timing']),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const records = [];
  for (let i = 0; i < runs; i += 1) {
    const r = await requestOnce(target);
    records.push(r);
  }

  const ok = records.filter((r) => r.status >= 200 && r.status < 300);
  if (!ok.length) {
    console.error('No successful responses.');
    process.exit(2);
  }

  const elapsedSorted = ok.map((r) => r.elapsedMs).sort((a, b) => a - b);
  const bytesSorted = ok.map((r) => r.responseBytes).sort((a, b) => a - b);
  const totalTiming = ok.map((r) => Number(r.serverTiming.total || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  const sqlTiming = ok.map((r) => Number(r.serverTiming.sql || 0)).filter((n) => n > 0).sort((a, b) => a - b);
  const jobsQueryTiming = ok.map((r) => Number(r.serverTiming.jobs_query || 0)).filter((n) => n > 0).sort((a, b) => a - b);

  console.log(JSON.stringify({
    url: target,
    runs,
    success: ok.length,
    status_failures: records.length - ok.length,
    latency_ms: {
      mean: Number(mean(elapsedSorted).toFixed(2)),
      p50: Number(percentile(elapsedSorted, 50).toFixed(2)),
      p95: Number(percentile(elapsedSorted, 95).toFixed(2)),
      p99: Number(percentile(elapsedSorted, 99).toFixed(2)),
    },
    response_bytes: {
      mean: Math.round(mean(bytesSorted)),
      p50: Math.round(percentile(bytesSorted, 50)),
      p95: Math.round(percentile(bytesSorted, 95)),
      p99: Math.round(percentile(bytesSorted, 99)),
    },
    server_timing_ms: {
      total: totalTiming.length ? {
        mean: Number(mean(totalTiming).toFixed(2)),
        p50: Number(percentile(totalTiming, 50).toFixed(2)),
        p95: Number(percentile(totalTiming, 95).toFixed(2)),
      } : null,
      sql: sqlTiming.length ? {
        mean: Number(mean(sqlTiming).toFixed(2)),
        p50: Number(percentile(sqlTiming, 50).toFixed(2)),
        p95: Number(percentile(sqlTiming, 95).toFixed(2)),
      } : null,
      jobs_query: jobsQueryTiming.length ? {
        mean: Number(mean(jobsQueryTiming).toFixed(2)),
        p50: Number(percentile(jobsQueryTiming, 50).toFixed(2)),
        p95: Number(percentile(jobsQueryTiming, 95).toFixed(2)),
      } : null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(3);
});
