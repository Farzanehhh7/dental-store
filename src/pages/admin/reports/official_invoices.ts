import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundMoney,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

export const officialInvoicesReport: ReportDefinition = {
  id: 'official_invoices',
  group: 'مالی و پرداخت',
  title: '۱۲. دفتر فاکتورهای رسمی صادرشده و ابطال‌شده',
  description: 'دفتر کل فاکتورهای رسمی و عادی صادرشده با تفکیک وضعیت صدور/ابطال، شناسه ملی و کد اقتصادی.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.invoices.filter((inv) => {
      if (!isIsoWithinRange(inv.issuedAt, params)) return false;
      if (params?.status && inv.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(
          `${inv.invoiceNo} ${inv.orderNo} ${inv.customerName} ${inv.nationalId ?? ''} ${inv.economicCode ?? ''}`
        ).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      .map((inv) => ({
        invoiceNo: inv.invoiceNo,
        orderNo: inv.orderNo,
        customerName: inv.customerName,
        typeLabel: inv.isOfficial ? 'رسمی' : 'عادی',
        nationalId: inv.nationalId || '—',
        economicCode: inv.economicCode || '—',
        subtotal: roundMoney(inv.subtotal),
        taxTotal: roundMoney(inv.taxTotal),
        grandTotal: roundMoney(inv.grandTotal),
        statusLabel: inv.status === 'issued' ? 'صادرشده' : 'ابطال‌شده',
        issuedAt: toJalaliYmd(inv.issuedAt),
      }));

    const issued = filtered.filter((i) => i.status === 'issued');
    const voided = filtered.filter((i) => i.status === 'voided');

    return createReportResult(this, {
      columns: [
        { key: 'invoiceNo', label: 'شماره فاکتور', type: 'text' },
        { key: 'orderNo', label: 'سفارش مرجع', type: 'text' },
        { key: 'customerName', label: 'خریدار', type: 'text' },
        { key: 'typeLabel', label: 'نوع', type: 'text' },
        { key: 'nationalId', label: 'شناسه ملی', type: 'text' },
        { key: 'economicCode', label: 'کد اقتصادی', type: 'text' },
        { key: 'subtotal', label: 'مبلغ پایه', type: 'money' },
        { key: 'taxTotal', label: 'مالیات', type: 'money' },
        { key: 'grandTotal', label: 'جمع کل', type: 'money' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'issuedAt', label: 'تاریخ صدور', type: 'date' },
      ],
      rows,
      totalsRow: {
        invoiceNo: 'جمع کل صادرشده',
        orderNo: `${issued.length} معتبر`,
        customerName: `${voided.length} باطله`,
        typeLabel: '—',
        nationalId: '—',
        economicCode: '—',
        subtotal: roundMoney(issued.reduce((s, i) => s + i.subtotal, 0)),
        taxTotal: roundMoney(issued.reduce((s, i) => s + i.taxTotal, 0)),
        grandTotal: roundMoney(issued.reduce((s, i) => s + i.grandTotal, 0)),
        statusLabel: '—',
        issuedAt: '—',
      },
      summary: [
        { label: 'فاکتورهای صادرشده', value: issued.length, type: 'number', tone: 'good' },
        { label: 'فاکتورهای ابطال‌شده', value: voided.length, type: 'number', tone: voided.length > 0 ? 'warn' : 'neutral' },
        { label: 'جمع مبالغ صادرشده', value: roundMoney(issued.reduce((s, i) => s + i.grandTotal, 0)), type: 'money' },
      ],
      chart: {
        type: 'bar',
        title: 'ارزش فاکتورهای صادرشده و ابطالی',
        xKey: 'status',
        yKey: 'amount',
        valueType: 'money',
        data: [
          { status: 'صادرشده (رسمی)', amount: roundMoney(issued.filter((i) => i.isOfficial).reduce((s, i) => s + i.grandTotal, 0)) },
          { status: 'صادرشده (عادی)', amount: roundMoney(issued.filter((i) => !i.isOfficial).reduce((s, i) => s + i.grandTotal, 0)) },
          { status: 'ابطال‌شده', amount: roundMoney(voided.reduce((s, i) => s + i.grandTotal, 0)) },
        ],
      },
      params,
    });
  },
};

export default officialInvoicesReport;
