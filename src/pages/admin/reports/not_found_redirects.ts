import {
  createReportResult,
  filterRowsBySearch,
  isIsoWithinRange,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

export const notFoundRedirectsReport: ReportDefinition = {
  id: 'not_found_redirects',
  group: 'محتوا و سئو',
  title: '۲۸. صفحات ۴۰۴ پرتکرار و کارکرد ریدایرکت‌ها',
  description: 'تطبیق مسیرهای ۴۰۴ ثبت‌شده در سرور با قوانین ریدایرکت (301/302/410) و شناسایی مسیرهای بدون ریدایرکت.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const redirectByFrom = new Map(data.redirects.map((r) => [r.fromPath, r]));
    const rowsRaw: Array<Record<string, string | number>> = [];

    for (const nf of data.notFoundLogs) {
      if (!isIsoWithinRange(nf.lastSeenAt, params)) continue;
      const matchedRedirect = redirectByFrom.get(nf.path);
      const recordStatus = matchedRedirect ? '404_with_redirect' : 'unresolved_404';
      if (params?.status && params.status !== recordStatus) continue;

      rowsRaw.push({
        recordType: 'گزارش ۴۰۴',
        path: nf.path,
        targetPath: matchedRedirect ? matchedRedirect.toPath : 'ریدایرکت تعریف نشده',
        statusCode: matchedRedirect ? matchedRedirect.statusCode : 404,
        hitCount: nf.hitCount,
        coverageStatus: matchedRedirect ? 'پوشش‌داده‌شده با ریدایرکت' : '۴۰۴ باز (نیازمند ریدایرکت)',
        dateLabel: toJalaliYmd(nf.lastSeenAt),
      });
    }

    for (const red of data.redirects) {
      if (!isIsoWithinRange(red.createdAt, params)) continue;
      if (params?.status && params.status !== 'redirect_rule') continue;
      rowsRaw.push({
        recordType: 'قانون ریدایرکت',
        path: red.fromPath,
        targetPath: red.toPath || '(حذف دائمی 410)',
        statusCode: red.statusCode,
        hitCount: red.hitCount,
        coverageStatus: 'ریدایرکت فعال',
        dateLabel: toJalaliYmd(red.createdAt),
      });
    }

    const filtered = filterRowsBySearch(rowsRaw, params?.q).sort(
      (a, b) => Number(b.hitCount) - Number(a.hitCount)
    );

    const unresolved404Count = data.notFoundLogs.filter((n) => !redirectByFrom.has(n.path)).length;
    const total404Hits = data.notFoundLogs.reduce((s, n) => s + n.hitCount, 0);
    const totalRedirectHits = data.redirects.reduce((s, r) => s + r.hitCount, 0);

    return createReportResult(this, {
      columns: [
        { key: 'recordType', label: 'نوع رکورد', type: 'text' },
        { key: 'path', label: 'مسیر مبدا', type: 'text' },
        { key: 'targetPath', label: 'مقصد ریدایرکت', type: 'text' },
        { key: 'statusCode', label: 'کد وضعیت', type: 'number' },
        { key: 'hitCount', label: 'تعداد رخداد', type: 'number' },
        { key: 'coverageStatus', label: 'وضعیت پوشش', type: 'status' },
        { key: 'dateLabel', label: 'آخرین ثبت / ایجاد', type: 'date' },
      ],
      rows: filtered,
      totalsRow: {
        recordType: 'جمع کل',
        path: `${data.notFoundLogs.length} مسیر ۴۰۴ | ${data.redirects.length} ریدایرکت`,
        targetPath: '—',
        statusCode: 0,
        hitCount: filtered.reduce((s, r) => s + Number(r.hitCount), 0),
        coverageStatus: `${unresolved404Count} مورد بدون ریدایرکت`,
        dateLabel: '—',
      },
      summary: [
        { label: 'مسیرهای ۴۰۴ بدون ریدایرکت', value: unresolved404Count, type: 'number', tone: unresolved404Count > 0 ? 'warn' : 'good' },
        { label: 'مجموع رخداد ۴۰۴', value: total404Hits, type: 'number' },
        { label: 'قوانین ریدایرکت فعال', value: data.redirects.length, type: 'number', tone: 'good' },
        { label: 'مجموع هدایت موفق ریدایرکت', value: totalRedirectHits, type: 'number' },
      ],
      chart: {
        type: 'bar',
        title: 'پربازدیدترین مسیرهای ۴۰۴ و ریدایرکت',
        xKey: 'path',
        yKey: 'hitCount',
        valueType: 'number',
        data: filtered.slice(0, 10).map((r) => ({ path: r.path, hitCount: r.hitCount })),
      },
      params,
    });
  },
};

export default notFoundRedirectsReport;
