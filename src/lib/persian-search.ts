const SYNONYMS: Record<string, string[]> = {
  woodpecker: ['وودپیکر', 'ودپکر', 'ووداکر', 'ودپیکر'],
  coxo: ['کوکسو', 'ککسو'],
  dentsply: ['دنتسپلای', 'دنتسپلی'],
  kerr: ['کر'],
  nsk: ['ان اس کی', 'انسکی'],
  '3m': ['تری ام', 'تریم'],
  composite: ['کامپوزیت', 'ترمیمی'],
  rotary: ['روتاری', 'فایل'],
  gloves: ['دستکش', 'نیتریل', 'لاتکس'],
  autoclave: ['اتوکلاو', 'استریل'],
  turbine: ['توربین', 'هندپیس'],
};

/**
 * Implements DATA_AND_ADMIN_SPEC §7.1 Persian normalization pipeline:
 * 1. Unicode NFKC
 * 2. Arabic -> Persian letters (ي->ی, ك->ک, ة->ه, ؤ->و, أ/إ->ا, ۀ->ه)
 * 3. Strip tatweel/kashida (U+0640) and diacritics
 * 4. Normalize Persian/Arabic-Indic digits -> ASCII 0-9
 * 5. Normalize ZWNJ (U+200C) -> space
 * 6. Lowercase Latin & collapse whitespace
 */
export function normalizePersian(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKC')
    .replace(/[\u064A\u0649]/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/[\u0629\u06C0]/g, 'ه')
    .replace(/\u0624/g, 'و')
    .replace(/[\u0623\u0625\u0622]/g, 'ا')
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\u200C/g, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-_.]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripKashida(text: string): string {
  return text.replace(/\u0640/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function expandQueryWithSynonyms(query: string): string[] {
  const norm = normalizePersian(query);
  if (!norm) return [];
  const terms = new Set<string>([norm, norm.replace(/\s+/g, '')]);
  for (const [canon, variants] of Object.entries(SYNONYMS)) {
    const normVariants = variants.map(normalizePersian);
    if (norm.includes(canon) || normVariants.some((v) => norm.includes(v))) {
      terms.add(canon);
      normVariants.forEach((v) => terms.add(v));
    }
  }
  return Array.from(terms);
}

export function scoreSearchMatch(query: string, fields: { exactCodes: string[]; textFields: string[] }): number {
  const normQuery = normalizePersian(query);
  if (!normQuery) return 1;

  // Exact SKU / IMED / Barcode match (typo tolerance disabled on codes per §7.3)
  for (const code of fields.exactCodes) {
    const normCode = normalizePersian(code);
    if (!normCode) continue;
    if (normCode === normQuery) return 100;
    if (normCode.includes(normQuery)) return 80;
  }

  const expandedTerms = expandQueryWithSynonyms(query);
  const haystack = normalizePersian(fields.textFields.join(' '));
  const haystackNoSpace = haystack.replace(/\s+/g, '');
  const hayWords = haystack.split(' ').filter(Boolean);

  let bestScore = 0;
  for (const term of expandedTerms) {
    if (haystack.includes(term) || haystackNoSpace.includes(term.replace(/\s+/g, ''))) {
      bestScore = Math.max(bestScore, 60);
      continue;
    }
    const queryWords = term.split(' ').filter((w) => w.length >= 4);
    for (const qw of queryWords) {
      const maxDist = qw.length >= 8 ? 2 : 1;
      for (const hw of hayWords) {
        if (Math.abs(hw.length - qw.length) <= maxDist && levenshtein(qw, hw) <= maxDist) {
          bestScore = Math.max(bestScore, 35);
        }
      }
    }
  }
  return bestScore;
}
