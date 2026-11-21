import {
  CUSTOMER_GROUP_LABELS,
  createReportResult,
  isIsoWithinRange,
  normalizeSearchText,
  roundPct,
  toJalaliYmd,
} from './helpers';
import type { ReportDefinition } from './types';

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار بررسی',
  approved: 'تاییدشده',
  rejected: 'ردشده',
  needs_info: 'نیازمند اصلاح مدارک',
};

export const b2bPipelineReport: ReportDefinition = {
  id: 'b2b_pipeline',
  group: 'مشتریان و B2B',
  title: '۲۲. وضعیت درخواست‌های احراز هویت B2B',
  description: 'پایش قیف درخواست‌های همکاری کلینیک‌ها، دندانپزشکان، لابراتوارها و نمایندگان فروش با کد نظام پزشکی.',
  available: true,
  params: ['dateRange', 'status', 'search'],
  run(data, params) {
    const q = normalizeSearchText(params?.q);
    const filtered = data.b2bVerifications.filter((b) => {
      if (!isIsoWithinRange(b.createdAt, params)) return false;
      if (params?.status && b.status !== params.status) return false;
      if (
        q &&
        !normalizeSearchText(`${b.applicantName} ${b.clinicName} ${b.medicalCouncilNo} ${b.mobile}`).includes(q)
      ) {
        return false;
      }
      return true;
    });

    const rows = [...filtered]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((b) => ({
        applicantName: b.applicantName,
        clinicName: b.clinicName,
        mobile: b.mobile,
        requestedGroupLabel: CUSTOMER_GROUP_LABELS[b.requestedGroup] ?? b.requestedGroup,
        medicalCouncilNo: b.medicalCouncilNo,
        statusLabel: STATUS_LABELS[b.status] ?? b.status,
        rejectReason: b.rejectReason || '—',
        createdAt: toJalaliYmd(b.createdAt),
      }));

    const approvedCount = filtered.filter((b) => b.status === 'approved').length;
    const pendingCount = filtered.filter((b) => b.status === 'pending' || b.status === 'needs_info').length;
    const byStatus = new Map<string, number>();
    for (const b of filtered) {
      const lbl = STATUS_LABELS[b.status] ?? b.status;
      byStatus.set(lbl, (byStatus.get(lbl) ?? 0) + 1);
    }

    return createReportResult(this, {
      columns: [
        { key: 'applicantName', label: 'نام متقاضی', type: 'text' },
        { key: 'clinicName', label: 'نام مرکز / کلینیک', type: 'text' },
        { key: 'mobile', label: 'موبایل', type: 'text' },
        { key: 'requestedGroupLabel', label: 'گروه درخواستی', type: 'text' },
        { key: 'medicalCouncilNo', label: 'شماره نظام پزشکی', type: 'text' },
        { key: 'statusLabel', label: 'وضعیت بررسی', type: 'status' },
        { key: 'rejectReason', label: 'توضیح / علت رد', type: 'text' },
        { key: 'createdAt', label: 'تاریخ ثبت', type: 'date' },
      ],
      rows,
      totalsRow: {
        applicantName: 'جمع کل',
        clinicName: `${rows.length} درخواست`,
        mobile: '—',
        requestedGroupLabel: '—',
        medicalCouncilNo: '—',
        statusLabel: `${approvedCount} تایید | ${pendingCount} باز`,
        rejectReason: '—',
        createdAt: '—',
      },
      summary: [
        { label: 'کل درخواست‌های B2B', value: rows.length, type: 'number' },
        { label: 'در انتظار / نیازمند اصلاح', value: pendingCount, type: 'number', tone: pendingCount > 0 ? 'warn' : 'good' },
        { label: 'تاییدشده', value: approvedCount, type: 'number', tone: 'good' },
        { label: 'نرخ تایید (%)', value: roundPct(approvedCount, rows.length), type: 'percent' },
      ],
      chart: {
        type: 'bar',
        title: 'توزیع درخواست‌های B2B بر اساس وضعیت',
        xKey: 'status',
        yKey: 'count',
        valueType: 'number',
        data: Array.from(byStatus.entries()).map(([status, count]) => ({ status, count })),
      },
      params,
    });
  },
};

export default b2bPipelineReport;
