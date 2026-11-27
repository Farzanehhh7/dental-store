import { createReportResult, isIsoWithinRange, normalizeSearchText, roundPct } from './helpers';
import type { ReportDefinition } from './types';

const STATUS_FA: Record<string, string> = {
  active: 'فعال (در حال خرید)',
  abandoned: 'رهاشده',
  reminded: 'یادآور ارسال‌شده',
  recovered: 'بازیابی‌شده (سفارش)',
  opted_out: 'انصراف مشتری',
};

export const abandonedRecoveryReport: ReportDefinition = {
  id: 'abandoned_recovery',
  group: 'فروش و سفارش',
  title: '۹. سبدهای رهاشده و نرخ بازیابی',
  description: 'پایش سبدهای رهاشده مشتریان، ارزش سبدهای ناتمام، یادآورهای ارسالی و نرخ بازیابی واقعی.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  statusOptions: [
    { value: 'abandoned', label: 'رهاشده' },
    { value: 'reminded', label: 'یادآور ارسال‌شده' },
    { value: 'recovered', label: 'بازیابی‌شده' },
    { value: 'active', label: 'فعال' },
    { value: 'opted_out', label: 'انصراف مشتری' },
  ],
  run(data, params) {
    const allCarts = data.abandonedCarts ?? [];
    const needle = normalizeSearchText(params?.q);
    const filtered = allCarts.filter((c) => {
      const refDate = c.abandonedAt ?? c.updatedAt ?? c.createdAt;
      if (!isIsoWithinRange(refDate, params)) return false;
      if (params?.status && c.status !== params.status) return false;
      if (
        needle &&
        ![c.customerName, c.mobile, c.email, c.id].some((field) =>
          normalizeSearchText(field).includes(needle)
        )
      ) {
        return false;
      }
      return true;
    });

    const abandonedOrReminded = filtered.filter((c) => c.status === 'abandoned' || c.status === 'reminded');
    const recoveredAfterTrack = filtered.filter((c) => c.status === 'recovered');
    const remindedCarts = filtered.filter((c) => (c.reminderCount || 0) > 0);
    const totalEligible = abandonedOrReminded.length + recoveredAfterTrack.length;
    const recoveryRate = roundPct(recoveredAfterTrack.length, totalEligible);

    const totalAbandonedValue = abandonedOrReminded.reduce((sum, c) => sum + (c.subtotal || 0), 0);
    const totalRecoveredValue = recoveredAfterTrack.reduce((sum, c) => sum + (c.subtotal || 0), 0);
    const totalReminders = filtered.reduce((sum, c) => sum + (c.reminderCount || 0), 0);

    const rows = filtered
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((c) => ({
        cartId: c.id,
        customerName: c.customerName || 'مشتری ثبت‌نام‌شده',
        contact: c.mobile || c.email || '—',
        itemsCount: c.items.reduce((s, it) => s + it.quantity, 0),
        subtotal: c.subtotal,
        reminderCount: c.reminderCount || 0,
        lastReminderAt: c.lastReminderAt || '',
        statusLabel: STATUS_FA[c.status] || c.status,
        statusCode: c.status,
        updatedAt: c.abandonedAt ?? c.updatedAt,
      }));

    return createReportResult(this, {
      columns: [
        { key: 'customerName', label: 'نام مشتری', type: 'text' },
        { key: 'contact', label: 'موبایل / ایمیل', type: 'text' },
        { key: 'itemsCount', label: 'تعداد اقلام', type: 'number' },
        { key: 'subtotal', label: 'ارزش سبد', type: 'money' },
        { key: 'reminderCount', label: 'یادآور ارسالی', type: 'number' },
        { key: 'lastReminderAt', label: 'آخرین یادآور', type: 'date' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'updatedAt', label: 'آخرین فعالیت', type: 'date' },
      ],
      rows,
      totalsRow: {
        customerName: `جمع (${rows.length} سبد)`,
        contact: '',
        itemsCount: rows.reduce((s, r) => s + Number(r.itemsCount || 0), 0),
        subtotal: rows.reduce((s, r) => s + Number(r.subtotal || 0), 0),
        reminderCount: totalReminders,
        lastReminderAt: '',
        statusLabel: '',
        updatedAt: '',
      },
      summary: [
        { label: 'سبدهای رهاشده/در انتظار', value: abandonedOrReminded.length, type: 'number', tone: 'warn' },
        { label: 'ارزش سبدهای رهاشده', value: totalAbandonedValue, type: 'money', tone: 'warn' },
        { label: 'سبدهای بازیابی‌شده', value: recoveredAfterTrack.length, type: 'number', tone: 'good' },
        { label: 'ارزش بازیابی‌شده', value: totalRecoveredValue, type: 'money', tone: 'good' },
        { label: 'نرخ بازیابی', value: recoveryRate, type: 'percent', tone: recoveryRate > 0 ? 'good' : 'neutral' },
        { label: 'یادآورهای ارسال‌شده', value: remindedCarts.length, type: 'number', tone: 'neutral' },
      ],
      params,
    });
  },
};

export default abandonedRecoveryReport;
