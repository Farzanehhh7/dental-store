export interface WebVitalMetric {
  name: 'LCP' | 'CLS' | 'INP' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  path: string;
  recordedAt: string;
}

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    _paq?: unknown[][];
    __dmVitals?: WebVitalMetric[];
  }
}

export function trackEcommerceEvent(
  eventName: 'view_item' | 'add_to_cart' | 'begin_checkout' | 'purchase' | 'search',
  payload: Record<string, unknown>
): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: eventName,
    ecommerce: payload,
    timestamp: new Date().toISOString(),
  });
  if (Array.isArray(window._paq)) {
    window._paq.push(['trackEvent', 'Ecommerce', eventName, JSON.stringify(payload)]);
  }
}

export function initWebVitalsRum(): void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;
  window.__dmVitals = window.__dmVitals || [];

  const record = (name: WebVitalMetric['name'], value: number) => {
    const rating: WebVitalMetric['rating'] =
      name === 'LCP'
        ? value <= 2500
          ? 'good'
          : value <= 4000
          ? 'needs-improvement'
          : 'poor'
        : name === 'CLS'
        ? value <= 0.1
          ? 'good'
          : value <= 0.25
          ? 'needs-improvement'
          : 'poor'
        : value <= 200
        ? 'good'
        : value <= 500
        ? 'needs-improvement'
        : 'poor';

    window.__dmVitals?.push({
      name,
      value: Number(value.toFixed(3)),
      rating,
      path: window.location.pathname,
      recordedAt: new Date().toISOString(),
    });
  };

  try {
    const lcpObs = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) record('LCP', last.startTime);
    });
    lcpObs.observe({ type: 'largest-contentful-paint', buffered: true });

    let clsValue = 0;
    const clsObs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput?: boolean; value?: number })[]) {
        if (!entry.hadRecentInput && entry.value) {
          clsValue += entry.value;
          record('CLS', clsValue);
        }
      }
    });
    clsObs.observe({ type: 'layout-shift', buffered: true });
  } catch {
    // Unsupported PerformanceObserver entry type in browser
  }
}
