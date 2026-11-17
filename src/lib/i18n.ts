import faMessages from '../messages/fa.json';
import { toPersianDigits } from './jalali';

type MessageTree = Record<string, unknown>;

export function t(
  key: string,
  params?: Record<string, string | number> | string,
  fallback?: string
): string {
  const resolvedParams = typeof params === 'object' ? params : undefined;
  const resolvedFallback = typeof params === 'string' ? params : fallback;

  const parts = key.split('.');
  let current: unknown = faMessages as MessageTree;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return resolvedFallback ?? key;
    }
  }
  let text = typeof current === 'string' ? current : resolvedFallback ?? key;
  if (resolvedParams) {
    for (const [k, v] of Object.entries(resolvedParams)) {
      const formatted = typeof v === 'number' ? toPersianDigits(v.toLocaleString('en-US')) : String(v);
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), formatted);
    }
  }
  return text;
}
