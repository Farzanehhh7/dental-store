import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundMoney,
  roundPct,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس',
  sent: 'ارسال‌شده',
  viewed: 'مشاهده‌شده',
  accepted: 'تایید مشتری',
  rejected: 'ردشده',
  expired: 'منقضی',
  converted: 'تبدیل‌شده به سفارش',
};

export const proformaConversionReport: ReportDefinition = {
  id: 'proforma_conversion',
  group: 'مالی و پرداخت',
  title: '۱۵. نرخ تبدیل پیش‌فاکتور کلینیک به سفارش قطعی',
  description: 'ردیابی چرخه پیش‌فاکتورهای صادره برای کلینیک‌ها و نرخ تبدیل آن‌ها به سفارش قطعی (به همراه وضعیت RFQها).',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.proformas.filter((pf) => {
      if (!isIsoWithinRange(pf.createdAt, params)) return false;
      if (params?.status && pf.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${pf.proformaNo} ${pf.contactName} ${pf.clinicName ?? ''} ${pf.contactMobile}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((pf) => ({
        proformaNo: pf.proformaNo,
        contactName: pf.contactName,
        clinicName: pf.clinicName || '—',
        itemsCount: pf.items.reduce((s, it) => s + it.quantity, 0),
        grandTotal: roundMoney(pf.grandTotal),
        statusLabel: STATUS_LABELS[pf.status] ?? pf.status,
        convertedFlag: pf.status === 'converted' || Boolean(pf.orderId) ? 'بله' : 'خیر',
        validUntil: toJalaliYmd(pf.validUntil),
        createdAt: toJalaliYmd(pf.createdAt),
      }));

    const convertedCount = filtered.filter((p) => p.status === 'converted' || Boolean(p.orderId)).length;
    const convertedValue = filtered
      .filter((p) => p.status === 'converted' || Boolean(p.orderId))
      .reduce((s, p) => s + p.grandTotal, 0);
    const totalValue = filtered.reduce((s, p) => s + p.grandTotal, 0);

    const byStatus = new Map<string, number>();
    for (const pf of filtered) {
      const lbl = STATUS_LABELS[pf.status] ?? pf.status;
      byStatus.set(lbl, (byStatus.get(lbl) ?? 0) + pf.grandTotal);
    }

    return createReportResult(this, {
      columns: [
        { key: 'proformaNo', label: 'شماره پیش‌فاکتور', type: 'text' },
        { key: 'contactName', label: 'درخواست‌کننده', type: 'text' },
        { key: 'clinicName', label: 'نام مرکز/کلینیک', type: 'text' },
        { key: 'itemsCount', label: 'تعداد اقلام', type: 'number' },
        { key: 'grandTotal', label: 'مبلغ کل', type: 'money' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'convertedFlag', label: 'تبدیل به سفارش', type: 'text' },
        { key: 'validUntil', label: 'اعتبار تا', type: 'date' },
        { key: 'createdAt', label: 'تاریخ صدور', type: 'date' },
      ],
      rows,
      totalsRow: {
        proformaNo: 'جمع کل',
        contactName: `${rows.length} پیش‌فاکتور`,
        clinicName: `${convertedCount} تبدیل‌شده`,
        itemsCount: rows.reduce((s, r) => s + Number(r.itemsCount), 0),
        grandTotal: roundMoney(totalValue),
        statusLabel: `نرخ تبدیل ${roundPct(convertedCount, filtered.length)}٪`,
        convertedFlag: '—',
        validUntil: '—',
        createdAt: '—',
      },
      summary: [
        { label: 'کل پیش‌فاکتورها', value: filtered.length, type: 'number' },
        { label: 'تبدیل‌شده به سفارش', value: convertedCount, type: 'number', tone: 'good' },
        { label: 'نرخ تبدیل تعدادی (%)', value: roundPct(convertedCount, filtered.length), type: 'percent' },
        { label: 'ارزش تبدیل‌شده', value: roundMoney(convertedValue), type: 'money' },
      ],
      chart: {
        type: 'bar',
        title: 'ارزش پیش‌فاکتورها بر اساس وضعیت',
        xKey: 'status',
        yKey: 'amount',
        valueType: 'money',
        data: Array.from(byStatus.entries()).map(([status, amount]) => ({
          status,
          amount: roundMoney(amount),
        })),
      },
      params,
    });
  },
};

export default proformaConversionReport;
