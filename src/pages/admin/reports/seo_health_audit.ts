import { auditSeoHealth } from '../../../lib/seo';
import {
  createReportResult,
  filterProductsByParams,
  filterRowsBySearch,
} from './helpers';
import type { ReportDefinition } from './types';

const SEVERITY_LABELS: Record<string, string> = {
  error: 'خطا (فوری)',
  warning: 'هشدار سئو',
  pass: 'سالم',
};

export const seoHealthAuditReport: ReportDefinition = {
  id: 'seo_health_audit',
  group: 'محتوا و سئو',
  title: '۲۷. گزارش خطاهای سئو و Schema JSON-LD',
  description: 'ممیزی سلامت سئوی محصولات، دسته‌بندی‌ها و مقالات وبلاگ (E-E-A-T، تگ‌های متا، کشیده، تصاویر و کد IMED).',
  available: true,
  params: ['brandId', 'categoryId', 'status', 'search'],
  run(data, params) {
    const filteredProducts = filterProductsByParams(data.products, params);
    const findings = auditSeoHealth(filteredProducts, data.categories, data.blogPosts);

    const rowsRaw = findings
      .filter((f) => (!params?.status ? true : f.severity === params.status))
      .map((f) => ({
        ruleId: f.id,
        rule: f.rule,
        severity: SEVERITY_LABELS[f.severity] ?? f.severity,
        affectedCount: f.affectedCount,
        samplePaths: f.samplePaths.length > 0 ? f.samplePaths.join(' ، ') : '—',
        descriptionFa: f.descriptionFa,
      }));

    const rows = filterRowsBySearch(rowsRaw, params?.q);
    const errorRules = findings.filter((f) => f.severity === 'error').length;
    const warningRules = findings.filter((f) => f.severity === 'warning').length;
    const passRules = findings.filter((f) => f.severity === 'pass').length;
    const totalAffected = rows.reduce((s, r) => s + Number(r.affectedCount), 0);

    return createReportResult(this, {
      columns: [
        { key: 'rule', label: 'قاعده ممیزی سئو', type: 'text' },
        { key: 'severity', label: 'سطح اهمیت', type: 'status' },
        { key: 'affectedCount', label: 'تعداد موارد', type: 'number' },
        { key: 'samplePaths', label: 'نمونه مسیرهای دارای خطا', type: 'text' },
        { key: 'descriptionFa', label: 'توضیح فنی', type: 'text' },
      ],
      rows,
      totalsRow: {
        rule: 'جمع کل موارد بررسی‌شده',
        severity: `${errorRules} خطا | ${warningRules} هشدار`,
        affectedCount: totalAffected,
        samplePaths: `${data.blogPosts.length} مقاله وبلاگ ممیزی شد`,
        descriptionFa: '—',
      },
      summary: [
        { label: 'قواعد سالم (Pass)', value: passRules, type: 'number', tone: 'good' },
        { label: 'قواعد دارای هشدار', value: warningRules, type: 'number', tone: warningRules > 0 ? 'warn' : 'good' },
        { label: 'خطاهای بحرانی سئو', value: errorRules, type: 'number', tone: errorRules > 0 ? 'bad' : 'good' },
        { label: 'مقالات وبلاگ بررسی‌شده', value: data.blogPosts.length, type: 'number' },
      ],
      chart: {
        type: 'bar',
        title: 'تعداد خطاها و هشدارها به تفکیک قاعده سئو',
        xKey: 'rule',
        yKey: 'affectedCount',
        valueType: 'number',
        data: rows.map((r) => ({ rule: r.rule, affectedCount: r.affectedCount })),
      },
      params,
    });
  },
};

export default seoHealthAuditReport;
