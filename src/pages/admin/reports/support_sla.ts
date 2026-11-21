import {
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundPct,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<string, string> = {
  open: 'باز',
  pending_customer: 'در انتظار مشتری',
  pending_staff: 'در انتظار پاسخ کارشناس',
  resolved: 'حل‌شده',
  closed: 'بسته‌شده',
};

const DEPT_LABELS: Record<string, string> = {
  sales: 'فروش B2B',
  support: 'پشتیبانی',
  accounting: 'مالی و فاکتور',
  technical: 'فنی و تجهیزات',
};

export const supportSlaReport: ReportDefinition = {
  id: 'support_sla',
  group: 'مشتریان و B2B',
  title: '۲۵. تیکت‌های پشتیبانی و زمان پاسخگویی',
  description: 'سنجش زمان اولین پاسخ کارشناس (FRT)، زمان حل‌وفصل تیکت‌ها و توزیع تیکت‌ها بر اساس دپارتمان و اولویت.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.tickets.filter((t) => {
      if (!isIsoWithinRange(t.createdAt, params)) return false;
      if (params?.status && t.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${t.ticketNo} ${t.subject} ${t.orderNo ?? ''} ${t.department}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const responseMinutesList: number[] = [];
    const resolutionHoursList: number[] = [];

    const rows = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((t) => {
        const createdTs = new Date(t.createdAt).getTime();
        const updatedTs = new Date(t.updatedAt).getTime();
        const firstStaffMsg = t.messages.find((m) => m.isStaff);
        let firstResponseMin: number | string = 'پاسخ‌داده‌نشده';
        if (firstStaffMsg && Number.isFinite(createdTs)) {
          const staffTs = new Date(firstStaffMsg.createdAt).getTime();
          if (Number.isFinite(staffTs)) {
            const diffMin = Math.max(0, Math.round((staffTs - createdTs) / 60000));
            firstResponseMin = diffMin;
            responseMinutesList.push(diffMin);
          }
        }
        let resolutionHours: number | string = 'باز';
        if ((t.status === 'resolved' || t.status === 'closed') && Number.isFinite(createdTs) && Number.isFinite(updatedTs)) {
          const diffH = Math.max(0, Math.round(((updatedTs - createdTs) / 3600000) * 10) / 10);
          resolutionHours = diffH;
          resolutionHoursList.push(diffH);
        }

        return {
          ticketNo: t.ticketNo,
          subject: t.subject,
          departmentLabel: DEPT_LABELS[t.department] ?? t.department,
          priority: t.priority,
          messagesCount: t.messages.length,
          firstResponseMin,
          resolutionHours,
          statusLabel: STATUS_LABELS[t.status] ?? t.status,
          createdAt: toJalaliYmd(t.createdAt),
        };
      });

    const avgFrt =
      responseMinutesList.length > 0
        ? Math.round(responseMinutesList.reduce((s, m) => s + m, 0) / responseMinutesList.length)
        : 0;
    const resolvedCount = filtered.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    const unrespondedCount = filtered.filter((t) => !t.messages.some((m) => m.isStaff)).length;

    const byDept = new Map<string, number>();
    for (const t of filtered) {
      const lbl = DEPT_LABELS[t.department] ?? t.department;
      byDept.set(lbl, (byDept.get(lbl) ?? 0) + 1);
    }

    return createReportResult(this, {
      columns: [
        { key: 'ticketNo', label: 'شماره تیکت', type: 'text' },
        { key: 'subject', label: 'موضوع', type: 'text' },
        { key: 'departmentLabel', label: 'واحد', type: 'text' },
        { key: 'priority', label: 'اولویت', type: 'text' },
        { key: 'messagesCount', label: 'تعداد پیام', type: 'number' },
        { key: 'firstResponseMin', label: 'اولین پاسخ (دقیقه)', type: 'number' },
        { key: 'resolutionHours', label: 'زمان حل (ساعت)', type: 'number' },
        { key: 'statusLabel', label: 'وضعیت', type: 'status' },
        { key: 'createdAt', label: 'تاریخ ثبت', type: 'date' },
      ],
      rows,
      totalsRow: {
        ticketNo: 'جمع کل',
        subject: `${rows.length} تیکت`,
        departmentLabel: '—',
        priority: '—',
        messagesCount: rows.reduce((s, r) => s + Number(r.messagesCount), 0),
        firstResponseMin: responseMinutesList.length > 0 ? avgFrt : 'پاسخ‌داده‌نشده',
        resolutionHours:
          resolutionHoursList.length > 0
            ? Math.round((resolutionHoursList.reduce((s, h) => s + h, 0) / resolutionHoursList.length) * 10) / 10
            : 0,
        statusLabel: `${resolvedCount} حل‌شده`,
        createdAt: '—',
      },
      summary: [
        { label: 'کل تیکت‌ها', value: rows.length, type: 'number' },
        { label: 'در انتظار اولین پاسخ کارشناس', value: unrespondedCount, type: 'number', tone: unrespondedCount > 0 ? 'warn' : 'good' },
        { label: 'میانگین اولین پاسخ (دقیقه)', value: responseMinutesList.length > 0 ? avgFrt : 'بدون پاسخ ثبت‌شده', type: responseMinutesList.length > 0 ? 'number' : 'text' },
        { label: 'نرخ حل‌وفصل (%)', value: roundPct(resolvedCount, rows.length), type: 'percent' },
      ],
      chart: {
        type: 'bar',
        title: 'تعداد تیکت‌ها به تفکیک دپارتمان',
        xKey: 'department',
        yKey: 'count',
        valueType: 'number',
        data: Array.from(byDept.entries()).map(([department, count]) => ({ department, count })),
      },
      params,
    });
  },
};

export default supportSlaReport;
