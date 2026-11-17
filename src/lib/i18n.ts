import faMessages from '../messages/fa.json';

type MessageTree = Record<string, unknown>;

export function t(key: string, fallback?: string): string {
  const parts = key.split('.');
  let current: unknown = faMessages as MessageTree;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return fallback ?? key;
    }
  }
  return typeof current === 'string' ? current : fallback ?? key;
}
