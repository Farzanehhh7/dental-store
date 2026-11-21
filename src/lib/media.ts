import type { ImgHTMLAttributes } from 'react';

export function normalizeAssetUrl(url?: string, fallback = '/og-default.svg'): string {
  const clean = (url || '').trim();
  if (!clean) return fallback;
  if (clean.startsWith('/src/assets/images/')) {
    return `/assets/images/${clean.slice('/src/assets/images/'.length)}`;
  }
  return clean;
}

export interface ResponsiveImageOptions {
  widths?: number[];
  sizes?: string;
  eager?: boolean;
  fallback?: string;
}

export function buildResponsiveImageProps(
  rawSrc?: string,
  options: ResponsiveImageOptions = {}
): Pick<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'sizes' | 'loading' | 'decoding'> & {
  fetchPriority?: 'high' | 'low' | 'auto';
} {
  const { widths = [400, 800, 1200], sizes, eager = false, fallback = '/og-default.svg' } = options;
  const src = normalizeAssetUrl(rawSrc, fallback);
  const isSvgOrData = src.startsWith('data:') || src.endsWith('.svg');

  let srcSet: string | undefined;
  if (!isSvgOrData && src.startsWith('/assets/')) {
    const joiner = src.includes('?') ? '&' : '?';
    srcSet = widths.map((w) => `${src}${joiner}w=${w} ${w}w`).join(', ');
  }

  return {
    src,
    ...(srcSet ? { srcSet } : {}),
    ...(sizes && srcSet ? { sizes } : {}),
    loading: eager ? 'eager' : 'lazy',
    decoding: 'async',
    ...(eager ? { fetchPriority: 'high' as const } : {}),
  };
}
