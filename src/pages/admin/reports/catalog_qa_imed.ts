import {
  createReportResult,
  filterProductsByParams,
  roundPct,
} from './helpers';
import type { ReportDefinition } from './types';

export const catalogQaImedReport: ReportDefinition = {
  id: 'catalog_qa_imed',
  group: 'محتوا و سئو',
  title: '۲۹. پوشش کد IMED، گواهینامه‌ها و نظرات',
  description: 'ارزیابی کیفیت داده‌های رگولاتوری و تعامل کاربران در کاتالوگ (کد IMED، مدارک تاییدشده CE/ISO/FDA، دیدگاه‌ها و پرسش‌وپاسخ).',
  available: true,
  params: ['brandId', 'categoryId', 'status', 'search'],
  run(data, params) {
    const filteredProducts = filterProductsByParams(data.products, params);
    const brandMap = new Map(data.brands.map((b) => [b.id, b.nameFa]));
    const categoryMap = new Map(data.categories.map((c) => [c.id, c.nameFa]));

    const reviewsByProduct = new Map<string, { approved: number; pending: number }>();
    for (const rev of data.reviews) {
      const cur = reviewsByProduct.get(rev.productId) ?? { approved: 0, pending: 0 };
      if (rev.status === 'approved') cur.approved += 1;
      else if (rev.status === 'pending') cur.pending += 1;
      reviewsByProduct.set(rev.productId, cur);
    }

    const questionsByProduct = new Map<string, { total: number; answered: number; pending: number }>();
    for (const q of data.questions) {
      const cur = questionsByProduct.get(q.productId) ?? { total: 0, answered: 0, pending: 0 };
      cur.total += 1;
      if (q.answerBody && q.answerBody.trim()) cur.answered += 1;
      if (q.status === 'pending') cur.pending += 1;
      questionsByProduct.set(q.productId, cur);
    }

    const rows = filteredProducts.map((p) => {
      const files = p.files ?? [];
      const verifiedCerts = files.filter((f) => f.isVerified).length;
      const revStats = reviewsByProduct.get(p.id) ?? { approved: 0, pending: 0 };
      const qStats = questionsByProduct.get(p.id) ?? { total: 0, answered: 0, pending: 0 };
      const hasImed = Boolean(p.imedCode && p.imedCode.trim());
      return {
        sku: p.sku,
        titleFa: p.titleFa,
        brandName: brandMap.get(p.brandId) ?? '—',
        categoryName: categoryMap.get(p.primaryCategoryId) ?? '—',
        imedCode: hasImed ? p.imedCode! : 'ثبت‌نشده',
        verifiedCerts,
        totalFiles: files.length,
        approvedReviews: revStats.approved,
        pendingReviews: revStats.pending,
        answeredQuestions: qStats.answered,
        totalQuestions: qStats.total,
        ratingAvg: p.ratingAvg,
        qaReadiness: hasImed && verifiedCerts > 0 ? 'کامل' : hasImed ? 'ناقص گواهینامه' : 'فاقد IMED',
      };
    });

    const withImedCount = rows.filter((r) => r.imedCode !== 'ثبت‌نشده').length;
    const withVerifiedCertCount = rows.filter((r) => Number(r.verifiedCerts) > 0).length;
    const totalPendingModeration = rows.reduce((s, r) => s + Number(r.pendingReviews), 0);
    const totalApprovedReviews = rows.reduce((s, r) => s + Number(r.approvedReviews), 0);

    return createReportResult(this, {
      columns: [
        { key: 'sku', label: 'SKU', type: 'text' },
        { key: 'titleFa', label: 'محصول', type: 'text' },
        { key: 'brandName', label: 'برند', type: 'text' },
        { key: 'categoryName', label: 'دسته‌بندی', type: 'text' },
        { key: 'imedCode', label: 'کد IMED', type: 'text' },
        { key: 'verifiedCerts', label: 'گواهینامه تاییدشده', type: 'number' },
        { key: 'approvedReviews', label: 'دیدگاه تاییدشده', type: 'number' },
        { key: 'pendingReviews', label: 'دیدگاه در انتظار', type: 'number' },
        { key: 'answeredQuestions', label: 'پرسش پاسخ‌داده‌شده', type: 'number' },
        { key: 'qaReadiness', label: 'وضعیت انطباق', type: 'status' },
      ],
      rows,
      totalsRow: {
        sku: 'جمع کل',
        titleFa: `${rows.length} محصول`,
        brandName: '—',
        categoryName: '—',
        imedCode: `${withImedCount} دارای کد`,
        verifiedCerts: rows.reduce((s, r) => s + Number(r.verifiedCerts), 0),
        approvedReviews: totalApprovedReviews,
        pendingReviews: totalPendingModeration,
        answeredQuestions: rows.reduce((s, r) => s + Number(r.answeredQuestions), 0),
        qaReadiness: `${roundPct(withImedCount, rows.length)}٪ IMED`,
      },
      summary: [
        { label: 'پوشش کد IMED (%)', value: roundPct(withImedCount, rows.length), type: 'percent', tone: withImedCount === rows.length ? 'good' : 'warn' },
        { label: 'دارای گواهینامه تاییدشده (%)', value: roundPct(withVerifiedCertCount, rows.length), type: 'percent' },
        { label: 'دیدگاه تاییدشده / در انتظار', value: `${totalApprovedReviews} / ${totalPendingModeration}`, type: 'text' },
      ],
      chart: {
        type: 'bar',
        title: 'شاخص‌های پوشش رگولاتوری و تعامل کاتالوگ',
        xKey: 'metric',
        yKey: 'count',
        valueType: 'number',
        data: [
          { metric: 'کل محصولات', count: rows.length },
          { metric: 'دارای کد IMED', count: withImedCount },
          { metric: 'دارای گواهینامه تاییدشده', count: withVerifiedCertCount },
          { metric: 'دیدگاه تاییدشده', count: totalApprovedReviews },
          { metric: 'پرسش پاسخ‌داده‌شده', count: rows.reduce((s, r) => s + Number(r.answeredQuestions), 0) },
        ],
      },
      params,
    });
  },
};

export default catalogQaImedReport;
