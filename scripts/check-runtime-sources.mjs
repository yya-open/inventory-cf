import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const functionsDir = path.join(root, 'functions');

const duplicates = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const tsPath = fullPath.slice(0, -3) + '.ts';
    if (fs.existsSync(tsPath)) {
      duplicates.push({ js: path.relative(root, fullPath), ts: path.relative(root, tsPath) });
    }
  }
}

if (fs.existsSync(functionsDir)) walk(functionsDir);

if (duplicates.length) {
  console.error(`发现 ${duplicates.length} 组重复运行时源码（.js/.ts 并存）：`);
  for (const pair of duplicates) {
    console.error(`- ${pair.js} <=> ${pair.ts}`);
  }
  process.exit(1);
}

console.log('未发现重复运行时源码');
