#!/usr/bin/env node
/**
 * The Georgian guard (ticket 9 task 16).
 *
 * On 27, 30 and 31 August three "round" commits retyped Georgian strings and
 * silently degraded them — ჩ→ჭ, ჩ→ც, წ→ც, ი→ე, ქ→ყ, ღვრ→ი — inside commits
 * whose messages described other work entirely. „ხმით ჩაწერა" became „ხმით
 * ჭაწერა" on every screen, „ოქტომბერი" became „ოქტობერი", „მიიღე" became
 * „მიიგე". Nobody could see it in a diff full of CSS, and no test could fail.
 *
 * Two checks, both cheap:
 *
 *   1. DAMAGED FORMS — the exact broken words we have actually shipped. If one
 *      comes back, it is named on sight.
 *   2. UNKNOWN WORDS — every Georgian word in the UI is compared against the
 *      checked-in inventory (scripts/ka-words.txt). A retype that invents a
 *      word cannot pass silently: someone has to add it to the inventory, and
 *      that is exactly the moment a Georgian speaker reads it.
 *
 * Run by `npm run lint`. To accept genuinely new wording:
 *   node scripts/check-georgian.mjs --update
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const INVENTORY = join(ROOT, 'scripts', 'ka-words.txt');
const GEORGIAN_WORD = /[ა-ჿ]+/g;

/** Broken forms this codebase has actually shipped. Never again, by name. */
const DAMAGED = [
  'ჭაწერ',
  'გაჭერ',
  'შეჭერდ',
  'ჭანაწერ',
  'ჭანაცერ',
  'ჭემი',
  'საჭვენებ',
  'დარჭა',
  'გამოჭნდ',
  'ჭვეულებრივ',
  'ჭაიტვირთ',
  'ჭასვლა',
  'აირციე',
  'მომეცე ',
  'განუსაზიევ',
  'განმისაზიერ',
  'მაყვს',
  'დარწება',
  'ოქტობერი',
  'ლინქი',
  'დაამათე',
  'მიიგე',
  'მიიღებულია',
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(path);
  }
  return out;
}

const files = walk(SRC);
const words = new Set();
const damaged = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const bad of DAMAGED) {
      if (line.includes(bad)) {
        damaged.push(`${file.replace(ROOT + '/', '')}:${i + 1}  ${bad}  →  ${line.trim()}`);
      }
    }
    for (const word of line.match(GEORGIAN_WORD) ?? []) words.add(word);
  });
}

if (process.argv.includes('--update')) {
  writeFileSync(INVENTORY, [...words].sort().join('\n') + '\n', 'utf8');
  console.log(`[ka] inventory updated: ${words.size} words`);
  process.exit(0);
}

let known;
try {
  known = new Set(readFileSync(INVENTORY, 'utf8').split('\n').filter(Boolean));
} catch {
  console.error('[ka] no inventory yet — run: node scripts/check-georgian.mjs --update');
  process.exit(1);
}

const unknown = [...words].filter((w) => !known.has(w)).sort();

if (damaged.length > 0) {
  console.error('\n[ka] DAMAGED Georgian — these exact broken forms have shipped before:\n');
  for (const line of damaged) console.error('  ' + line);
}
if (unknown.length > 0) {
  console.error(
    `\n[ka] ${unknown.length} Georgian word(s) not in the inventory. A retype that quietly ` +
      'changes a letter looks exactly like this — read them, then accept with --update:\n',
  );
  console.error('  ' + unknown.join('  '));
}
if (damaged.length > 0 || unknown.length > 0) {
  console.error('');
  process.exit(1);
}
console.log(`[ka] ok — ${words.size} Georgian words, all known, no damaged forms`);
