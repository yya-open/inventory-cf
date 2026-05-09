import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'functions', 'tests', 'scripts'];
const sourceExts = new Set(['.ts', '.vue', '.js', '.mjs']);
const ignoredDirs = new Set(['node_modules', 'dist', '.git']);
const replacementChar = /\uFFFD/;
const mojibakeCluster = /[鍑鐢鏄绯鎵搴閰寮缁灞鐩瀵棣褰杩鈥€]{2,}/;
const brokenQuestionCluster = /(?:[\u4e00-\u9fff].{0,12}\?{3,}|\?{3,}.{0,12}[\u4e00-\u9fff])/;
const findings = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath);
      continue;
    }
    if (!sourceExts.has(path.extname(filePath))) continue;
    if (filePath.endsWith('check-source-encoding.mjs')) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (replacementChar.test(line) || mojibakeCluster.test(line) || brokenQuestionCluster.test(line)) {
        findings.push(`${filePath}:${index + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
}

roots.forEach(walk);

if (findings.length) {
  console.error('发现疑似中文编码乱码：');
  console.error(findings.join('\n'));
  process.exit(1);
}

console.log('未发现疑似中文编码乱码');
