import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundMoney,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<string, string> = {
  requested: 'ثبت درخواست',
  approved: 'تاییدشده',
  received: 'دریافت در انبار',
  refunded: 'تسویه‌شده',
  rejected: 'ردشده',
};

const RESOLUTION_LABELS: Record<string, string> = {
  refund: 'استرداد وجه',
  replacement: 'تعویض کالا',
  credit: 'شارژ اعتبار',
};

export const refundsRmaReport: ReportDefinition = {
  id: 'refunds_rma',
  group: 'مالی و پرداخت',
  title: '۱۴. تحلیل مرجوعی‌ها و علل عودت کالا (RMA)',
  description: 'بررسی پرونده‌های مرجوعی کالا، وضعیت بازگشت به انبار (سالم/آسیب‌دیده)، علل عودت و مبالغ استردادی.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.returns.filter((ret) => {
      if (!isIsoWithinRange(ret.createdAt, params)) return false;
      if (params?.status && ret.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${ret.returnNo} ${ret.orderNo} ${ret.customerName} ${ret.reasonFa}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((r) => ({
        returnNo: r.returnNo,
        orderNo: r.orderNo,
        customerName: r.customerName,
        itemsQty: r.items.reduce((s, it) => s + it.quantity, 0),
        reasonFa: r.reasonFa,
        resolutionLabel: RESOLUTION_LABELS[r.resolution] ?? r.resolution,
        conditionLabel: r.condition === 'damaged' ? 'آسیب‌دیده' : r.condition === 'resellable' ? 'قابل فروش مجدد' : 'نامشخص',
        refundAmount: roundMoney(r.refundAmount),
        statusLabel: STATUS_LABELS[r.status] ?? r.status,
        createdAt: toJalaliYmd(r.createdAt),
      }));

    const byReason = new Map<string, number>();
    for (const r of filtered) {
      const key = r.reasonFa.slice(0, 32);
      byReason.set(key, (byReason.get(key) ?? 0) + r.refundAmount);
    }

    const totalRefund = rows.reduce((s, r) => s + Number(r.refundAmount), 0);
    const approvedOrRefunded = filtered.filter((r) => ['approved', 'received', 'refunded'].includes(r.status)).length;

    return createReportResult(this, {
      columns: [
        { key: 'returnNo', label: 'شماره مرجوعی', type: 'text' },
        { key: 'orderNo', label: 'سفارش مرجع', type: 'text' },
        { key: 'customerName', label: 'مشتری', type: 'text' },
        { key: 'itemsQty', label: 'تعداد اقلام', type: 'number' },
        { key: 'reasonFa', label: 'علت مرجوعی', type: 'text' },
        { key: 'resolutionLabel', label: 'راه‌حل', type: 'text' },
        { key: 'conditionLabel', label: 'وضعیت سلامت کالا', type: 'text' },
        { key: 'refundAmount', label: 'مبلغ عودت', type: 'money' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'createdAt', label: 'تاریخ ثبت', type: 'date' },
      ],
      rows,
      totalsRow: {
        returnNo: 'جمع کل',
        orderNo: `${rows.length} پرونده`,
        customerName: '—',
        itemsQty: rows.reduce((s, r) => s + Number(r.itemsQty), 0),
        reasonFa: '—',
        resolutionLabel: '—',
        conditionLabel: '—',
        refundAmount: totalRefund,
        statusLabel: '—',
        createdAt: '—',
      },
      summary: [
        { label: 'کل درخواست‌های RMA', value: rows.length, type: 'number' },
        { label: 'تایید / دریافت / تسویه‌شده', value: approvedOrRefunded, type: 'number', tone: 'good' },
        { label: 'مجموع ارزش مرجوعی', value: totalRefund, type: 'money', tone: totalRefund > 0 ? 'warn' : 'neutral' },
      ],
      chart: {
        type: 'bar',
        title: 'ارزش مرجوعی بر اساس علت',
        xKey: 'reason',
        yKey: 'refundAmount',
        valueType: 'money',
        data: Array.from(byReason.entries()).map(([reason, refundAmount]) => ({
          reason,
          refundAmount: roundMoney(refundAmount),
        })),
      },
      params,
    });
  },
};

export default refundsRmaReport;
