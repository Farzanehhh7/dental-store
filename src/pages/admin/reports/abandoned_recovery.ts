import { createReportResult } from './helpers';
import type { ReportDefinition } from './types';

export const abandonedRecoveryReport: ReportDefinition = {
  id: 'abandoned_recovery',
  group: 'فروش و سفارش',
  title: '۹. سبدهای رهاشده و نرخ بازیابی',
  description: 'پایش سبدهای رهاشده مشتریان، ارزش سبدهای ناتمام و نرخ تبدیل پس از ارسال یادآور.',
  available: false,
  unavailableReason:
    'داده‌های سبد خرید در وضعیت فعلی فقط در حافظه مرورگر کاربر (localStorage) نگهداری می‌شود و رویداد رهاشدن/بازیابی سبد در سرور یا پایگاه داده ثبت نمی‌گردد؛ بنابراین محاسبه واقعی این گزارش در دسترس نیست.',
  params: ['dateRange'],
  run(_data, params) {
    return createReportResult(this, {
      columns: [],
      rows: [],
      summary: [
        { label: 'وضعیت داده', value: 'ثبت‌نشده در سرور', type: 'text', tone: 'warn' },
      ],
      params,
    });
  },
};

export default abandonedRecoveryReport;
