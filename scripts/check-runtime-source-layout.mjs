import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const functionsDir = path.join(root, 'functions');
const duplicatePairs = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.wrangler') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const jsTwin = full.slice(0, -3) + '.js';
    if (fs.existsSync(jsTwin)) duplicatePairs.push({ ts: path.relative(root, full), js: path.relative(root, jsTwin) });
  }
}
if (fs.existsSync(functionsDir)) walk(functionsDir);
if (duplicatePairs.length) {
  console.error('✘ 检测到重复运行时源码（.ts/.js 并存）：');
  for (const pair of duplicatePairs) console.error(`  - ${pair.ts} <> ${pair.js}`);
  process.exit(1);
}
console.log('✓ 未发现 functions 下重复的 .ts/.js 运行时源码');
