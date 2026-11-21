import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundPct,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<string, string> = {
  new: 'جدید',
  contacted: 'تماس برقرار شد',
  quoted: 'پیش‌فاکتور ارسال شد',
  won: 'موفق (فروش قطعی)',
  lost: 'ازدست‌رفته',
};

export const consultationsWinrateReport: ReportDefinition = {
  id: 'consultations_winrate',
  group: 'مشتریان و B2B',
  title: '۲۶. قیف مشاوره تجهیزات سرمایه‌ای (یونیت/اتوکلاو)',
  description: 'ردیابی سرنخ‌های مشاوره تجهیزات سرمایه‌ای مطب و کلینیک از ثبت اولیه تا استعلام قیمت و نرخ موفقیت فروش (Win Rate).',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.consultationRequests.filter((c) => {
      if (!isIsoWithinRange(c.createdAt, params)) return false;
      if (params?.status && c.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${c.name} ${c.clinicName ?? ''} ${c.productName ?? ''} ${c.mobile}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => ({
        name: c.name,
        clinicName: c.clinicName || '—',
        mobile: c.mobile,
        productName: c.productName || 'مشاوره عمومی تجهیزات',
        budgetRange: c.budgetRange || '—',
        statusLabel: STATUS_LABELS[c.status] ?? c.status,
        createdAt: toJalaliYmd(c.createdAt),
      }));

    const wonCount = filtered.filter((c) => c.status === 'won').length;
    const lostCount = filtered.filter((c) => c.status === 'lost').length;
    const quotedOrWonCount = filtered.filter((c) => c.status === 'quoted' || c.status === 'won').length;
    const closedTotal = wonCount + lostCount;

    const byStage = new Map<string, number>();
    for (const c of filtered) {
      const lbl = STATUS_LABELS[c.status] ?? c.status;
      byStage.set(lbl, (byStage.get(lbl) ?? 0) + 1);
    }

    return createReportResult(this, {
      columns: [
        { key: 'name', label: 'نام متقاضی', type: 'text' },
        { key: 'clinicName', label: 'کلینیک / مطب', type: 'text' },
        { key: 'mobile', label: 'موبایل', type: 'text' },
        { key: 'productName', label: 'تجهیز درخواستی', type: 'text' },
        { key: 'budgetRange', label: 'بودجه اعلامی', type: 'text' },
        { key: 'statusLabel', label: 'مرحله قیف', type: 'status' },
        { key: 'createdAt', label: 'تاریخ ثبت', type: 'date' },
      ],
      rows,
      totalsRow: {
        name: 'جمع کل',
        clinicName: `${rows.length} سرنخ`,
        mobile: '—',
        productName: `${quotedOrWonCount} پیشنهاد قیمت / برنده`,
        budgetRange: '—',
        statusLabel: `${wonCount} موفق | ${lostCount} ناموفق`,
        createdAt: '—',
      },
      summary: [
        { label: 'کل درخواست‌های مشاوره', value: rows.length, type: 'number' },
        { label: 'تبدیل موفق (Won)', value: wonCount, type: 'number', tone: 'good' },
        { label: 'نرخ موفقیت کل (Win Rate)', value: roundPct(wonCount, rows.length), type: 'percent' },
        { label: 'نرخ برد از پرونده‌های مختومه', value: roundPct(wonCount, closedTotal), type: 'percent' },
      ],
      chart: {
        type: 'bar',
        title: 'قیف مراحل مشاوره تجهیزات سرمایه‌ای',
        xKey: 'stage',
        yKey: 'count',
        valueType: 'number',
        data: Array.from(byStage.entries()).map(([stage, count]) => ({ stage, count })),
      },
      params,
    });
  },
};

export default consultationsWinrateReport;
