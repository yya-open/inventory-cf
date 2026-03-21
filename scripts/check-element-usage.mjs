import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const srcDir = path.join(root, 'src');
const pluginPath = path.join(srcDir, 'plugins', 'element-plus.ts');
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.vue')) files.push(full);
  }
  return files;
}
function tagToComponent(tag) {
  return 'El' + tag.replace(/^el-/, '').split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}
const pluginText = fs.readFileSync(pluginPath, 'utf8');
const match = pluginText.match(/const\s+components\s*=\s*\[(.*?)\]\s*as const;/s);
if (!match) {
  console.error('[check:element-usage] Could not parse global Element Plus components');
  process.exit(1);
}
const globals = new Set(match[1].match(/\bEl[A-Za-z0-9]+\b/g) || []);
const allow = new Set(['ElIcon']);
const problems = [];
for (const file of walk(srcDir)) {
  const text = fs.readFileSync(file, 'utf8');
  const tmpl = text.match(/<template>([\s\S]*?)<\/template>/i)?.[1] || '';
  if (!tmpl) continue;
  const script = [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  const local = new Set(script.match(/\bEl[A-Za-z0-9]+\b/g) || []);
  const tags = new Set([...tmpl.matchAll(/<(el-[a-z0-9-]+)\b/g)].map((m) => m[1]));
  for (const tag of tags) {
    const comp = tagToComponent(tag);
    if (globals.has(comp) || local.has(comp) || allow.has(comp)) continue;
    problems.push(`${path.relative(root, file)}: <${tag}> -> ${comp}`);
  }
}
if (problems.length) {
  console.error('[check:element-usage] Found missing registrations/imports:');
  for (const p of problems) console.error(`- ${p}`);
  process.exit(1);
}
console.log(`[check:element-usage] OK (${walk(srcDir).length} Vue files checked)`);
