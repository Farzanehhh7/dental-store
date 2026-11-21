import type { PaymentPlanStatus } from '../../../types/domain';
import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundMoney,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<PaymentPlanStatus, string> = {
  submitted: 'ثبت‌شده',
  under_review: 'در حال بررسی',
  needs_info: 'نیازمند مدارک',
  approved: 'تاییدشده',
  rejected: 'ردشده',
  active: 'جاری / فعال',
  settled: 'تسویه‌شده',
  defaulted: 'معوق / نکول',
  cancelled: 'لغوشده',
};

const TYPE_LABELS: Record<'credit' | 'installment' | 'cheque', string> = {
  credit: 'اعتبار B2B',
  installment: 'اقساطی',
  cheque: 'چک صیادی',
};

export const creditExposureReport: ReportDefinition = {
  id: 'credit_exposure',
  group: 'مالی و پرداخت',
  title: '۱۳. مانده اعتبار و اقساط سررسید مشتریان B2B',
  description: 'پایش تعهدات اعتباری، طرح‌های اقساطی و چک‌های صیادی کلینیک‌ها به تفکیک وضعیت بررسی، جاری و معوق.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.paymentPlans.filter((pl) => {
      if (!isIsoWithinRange(pl.createdAt, params)) return false;
      if (params?.status && pl.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${pl.customerName} ${pl.proposedTermsFa} ${pl.type} ${pl.orderId ?? ''}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => b.requestedAmount - a.requestedAmount)
      .map((pl) => ({
        customerName: pl.customerName,
        typeLabel: TYPE_LABELS[pl.type] ?? pl.type,
        installmentsCount: pl.installmentsCount,
        perInstallment: pl.installmentsCount > 0 ? roundMoney(pl.requestedAmount / pl.installmentsCount) : roundMoney(pl.requestedAmount),
        requestedAmount: roundMoney(pl.requestedAmount),
        statusLabel: STATUS_LABELS[pl.status] ?? pl.status,
        proposedTermsFa: pl.proposedTermsFa,
        createdAt: toJalaliYmd(pl.createdAt),
      }));

    const activeExposure = filtered
      .filter((p) => ['approved', 'active', 'under_review', 'submitted', 'needs_info'].includes(p.status))
      .reduce((s, p) => s + p.requestedAmount, 0);
    const defaultedExposure = filtered
      .filter((p) => p.status === 'defaulted')
      .reduce((s, p) => s + p.requestedAmount, 0);
    const settledTotal = filtered
      .filter((p) => p.status === 'settled')
      .reduce((s, p) => s + p.requestedAmount, 0);

    const byStatus = new Map<string, number>();
    for (const pl of filtered) {
      const lbl = STATUS_LABELS[pl.status] ?? pl.status;
      byStatus.set(lbl, (byStatus.get(lbl) ?? 0) + pl.requestedAmount);
    }

    return createReportResult(this, {
      columns: [
        { key: 'customerName', label: 'مشتری / کلینیک', type: 'text' },
        { key: 'typeLabel', label: 'نوع تسهیلات', type: 'text' },
        { key: 'installmentsCount', label: 'تعداد قسط', type: 'number' },
        { key: 'perInstallment', label: 'مبلغ هر قسط', type: 'money' },
        { key: 'requestedAmount', label: 'کل مبلغ طرح', type: 'money' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'proposedTermsFa', label: 'شرایط پیشنهادی', type: 'text' },
        { key: 'createdAt', label: 'تاریخ ثبت', type: 'date' },
      ],
      rows,
      totalsRow: {
        customerName: 'جمع کل',
        typeLabel: `${rows.length} پرونده`,
        installmentsCount: rows.reduce((s, r) => s + Number(r.installmentsCount), 0),
        perInstallment: 0,
        requestedAmount: rows.reduce((s, r) => s + Number(r.requestedAmount), 0),
        statusLabel: '—',
        proposedTermsFa: '—',
        createdAt: '—',
      },
      summary: [
        { label: 'پرونده‌های باز / جاری', value: roundMoney(activeExposure), type: 'money', tone: 'warn' },
        { label: 'مبالغ معوق (Defaulted)', value: roundMoney(defaultedExposure), type: 'money', tone: defaultedExposure > 0 ? 'bad' : 'good' },
        { label: 'تسویه‌شده', value: roundMoney(settledTotal), type: 'money', tone: 'good' },
      ],
      chart: {
        type: 'bar',
        title: 'حجم اعتبار بر اساس وضعیت',
        xKey: 'status',
        yKey: 'amount',
        valueType: 'money',
        data: Array.from(byStatus.entries()).map(([status, amount]) => ({ status, amount: roundMoney(amount) })),
      },
      params,
    });
  },
};

export default creditExposureReport;
