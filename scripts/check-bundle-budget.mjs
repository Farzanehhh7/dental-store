import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST_ASSETS = path.resolve(process.cwd(), 'dist', 'assets');

// Monolithic third-party browser libraries loaded lazily or isolated to specific subtrees
// where Vite/Rolldown cannot further tree-shake upstream internal modules.
// All app entry & route chunks remain strictly <= 250 KB raw.
const THIRD_PARTY_MONOLITH_PREFIXES = ['exceljs-', 'firebase-firestore-', 'recharts-core-'];

const MAX_APP_CHUNK_RAW_KB = 250;
const MAX_ENTRY_RAW_KB = 250;
const MAX_CSS_RAW_KB = 100;
const MAX_MONOLITH_GZIP_KB = 270;

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

if (!fs.existsSync(DIST_ASSETS)) {
  console.error('dist/assets directory missing. Run "npm run build" first.');
  process.exit(1);
}

const files = fs
  .readdirSync(DIST_ASSETS)
  .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
  .sort();

const violations = [];
const rows = [];

for (const file of files) {
  const fullPath = path.join(DIST_ASSETS, file);
  const content = fs.readFileSync(fullPath);
  const rawBytes = content.byteLength;
  const gzipBytes = zlib.gzipSync(content, { level: 9 }).byteLength;
  const rawKb = rawBytes / 1024;
  const gzipKb = gzipBytes / 1024;

  let status = 'OK';
  if (file.endsWith('.css')) {
    if (rawKb > MAX_CSS_RAW_KB) {
      status = `FAIL (> ${MAX_CSS_RAW_KB} KB)`;
      violations.push(`${file}: CSS raw size ${formatKb(rawBytes)} exceeds ${MAX_CSS_RAW_KB} KB budget`);
    }
  } else if (file.startsWith('index-')) {
    if (rawKb > MAX_ENTRY_RAW_KB) {
      status = `FAIL (> ${MAX_ENTRY_RAW_KB} KB)`;
      violations.push(`${file}: entry raw size ${formatKb(rawBytes)} exceeds ${MAX_ENTRY_RAW_KB} KB budget`);
    }
  } else if (THIRD_PARTY_MONOLITH_PREFIXES.some((prefix) => file.startsWith(prefix))) {
    if (gzipKb > MAX_MONOLITH_GZIP_KB) {
      status = `FAIL (> ${MAX_MONOLITH_GZIP_KB} KB gzip)`;
      violations.push(`${file}: vendor gzip size ${formatKb(gzipBytes)} exceeds ${MAX_MONOLITH_GZIP_KB} KB budget`);
    } else if (rawKb > MAX_APP_CHUNK_RAW_KB) {
      status = 'LAZY-VENDOR';
    }
  } else if (rawKb > MAX_APP_CHUNK_RAW_KB) {
    status = `FAIL (> ${MAX_APP_CHUNK_RAW_KB} KB)`;
    violations.push(`${file}: chunk raw size ${formatKb(rawBytes)} exceeds ${MAX_APP_CHUNK_RAW_KB} KB budget`);
  }

  rows.push({
    file,
    raw: formatKb(rawBytes),
    gzip: formatKb(gzipBytes),
    status,
  });
}

console.log('\nBundle Budget Report (dist/assets):');
console.log('File'.padEnd(42), 'Raw'.padStart(12), 'Gzip'.padStart(12), 'Status'.padStart(14));
console.log('-'.repeat(84));
for (const r of rows) {
  console.log(r.file.padEnd(42), r.raw.padStart(12), r.gzip.padStart(12), r.status.padStart(14));
}

if (violations.length > 0) {
  console.error('\nBundle budget violations detected:');
  for (const v of violations) console.error(` - ${v}`);
  process.exit(1);
}

console.log('\nBundle budget check passed.');
