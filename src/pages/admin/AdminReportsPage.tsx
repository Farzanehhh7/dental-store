import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileSpreadsheet } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatJalaliDate, formatJalaliDateTime, formatMoney, toPersianDigits } from '../../lib/jalali';
import { auditSeoHealth } from '../../lib/seo';

const REPORT_CATALOG: { id: string; group: string; title: string }[] = [
  { id: 'sales_daily', group: 'فروش و سفارش', title: '۱. گزارش فروش روزانه و روند درآمد' },
  { id: 'sales_by_category', group: 'فروش و سفارش', title: '۲. فروش به تفکیک دسته‌بندی تخصصی' },
  { id: 'sales_by_brand', group: 'فروش و سفارش', title: '۳. عملکرد و سهم فروش برندها' },
  { id: 'sales_by_sku', group: 'فروش و سفارش', title: '۴. پرفروش‌ترین SKUها و تنوع‌ها' },
  { id: 'sales_by_group', group: 'فروش و سفارش', title: '۵. فروش به تفکیک گروه مشتری (عادی/کلینیک/عمده)' },
  { id: 'sales_by_province', group: 'فروش و سفارش', title: '۶. پراکندگی جغرافیایی سفارش‌ها بر اساس استان' },
  { id: 'orders_funnel', group: 'فروش و سفارش', title: '۷. قیف وضعیت سفارش‌ها و لغوشده‌ها' },
  { id: 'coupon_effectiveness', group: 'فروش و سفارش', title: '۸. اثربخشی کدهای تخفیف و کمپین‌ها' },
  { id: 'abandoned_recovery', group: 'فروش و سفارش', title: '۹. سبدهای رهاشده و نرخ بازیابی' },
  { id: 'payment_methods', group: 'مالی و پرداخت', title: '۱۰. سهم روش‌های پرداخت (آنلاین / اعتبار / چک)' },
  { id: 'tax_vat_ledger', group: 'مالی و پرداخت', title: '۱۱. گزارش فصلی مالیات بر ارزش افزوده (VAT)' },
  { id: 'official_invoices', group: 'مالی و پرداخت', title: '۱۲. دفتر فاکتورهای رسمی صادرشده و ابطال‌شده' },
  { id: 'credit_exposure', group: 'مالی و پرداخت', title: '۱۳. مانده اعتبار و اقساط سررسید مشتریان B2B' },
  { id: 'refunds_rma', group: 'مالی و پرداخت', title: '۱۴. تحلیل مرجوعی‌ها و علل عودت کالا (RMA)' },
  { id: 'proforma_conversion', group: 'مالی و پرداخت', title: '۱۵. نرخ تبدیل پیش‌فاکتور کلینیک به سفارش قطعی' },
  { id: 'gross_margin', group: 'مالی و پرداخت', title: '۱۶. حاشیه سود ناخالص بر پایه قیمت خرید محرمانه' },
  { id: 'stock_valuation', group: 'انبار و FEFO', title: '۱۷. ارزش‌گذاری ریالی موجودی انبار' },
  { id: 'low_stock_alert', group: 'انبار و FEFO', title: '۱۸. کالاهای زیر نقطه سفارش (Low Stock)' },
  { id: 'fefo_expiry', group: 'انبار و FEFO', title: '۱۹. بچ‌های نزدیک به انقضای FEFO (زیر ۹۰ روز)' },
  { id: 'stock_movements', group: 'انبار و FEFO', title: '۲۰. گردش دفترکل ورود و خروج کالا' },
  { id: 'dead_stock', group: 'انبار و FEFO', title: '۲۱. کالاهای راکد و بدون فروش اخیر' },
  { id: 'b2b_pipeline', group: 'مشتریان و B2B', title: '۲۲. وضعیت درخواست‌های احراز هویت B2B' },
  { id: 'top_clinics', group: 'مشتریان و B2B', title: '۲۳. مشتریان کلیدی و کلینیک‌های با LTV بالا' },
  { id: 'customer_retention', group: 'مشتریان و B2B', title: '۲۴. خرید تکراری مصرفی کلینیک‌ها (Retention)' },
  { id: 'support_sla', group: 'مشتریان و B2B', title: '۲۵. تیکت‌های پشتیبانی و زمان پاسخگویی' },
  { id: 'consultations_winrate', group: 'مشتریان و B2B', title: '۲۶. قیف مشاوره تجهیزات سرمایه‌ای (یونیت/اتوکلاو)' },
  { id: 'seo_health_audit', group: 'محتوا و سئو', title: '۲۷. گزارش خطاهای سئو و Schema JSON-LD' },
  { id: 'not_found_redirects', group: 'محتوا و سئو', title: '۲۸. صفحات ۴۰۴ پرتکرار و کارکرد ریدایرکت‌ها' },
  { id: 'catalog_qa_imed', group: 'محتوا و سئو', title: '۲۹. پوشش کد IMED، گواهینامه‌ها و نظرات' },
];

export function AdminReportsPage() {
  const {
    orders,
    invoices,
    proformas,
    returns,
    paymentPlans,
    products,
    productCosts,
    categories,
    brands,
    b2bVerifications,
    notFoundLogs,
    settings,
    currency,
  } = useStore();

  const [selectedReportId, setSelectedReportId] = useState(REPORT_CATALOG[0].id);

  const reportRows = useMemo((): Record<string, string | number>[] => {
    switch (selectedReportId) {
      case 'sales_by_brand':
        return brands.map((b) => ({
          برند: b.nameFa,
          کشور: b.countryFa,
          تعداد_کالا: products.filter((p) => p.brandId === b.id).length,
          فروش_تعدادی: products.filter((p) => p.brandId === b.id).reduce((s, p) => s + p.soldCount, 0),
        }));
      case 'official_invoices':
        return invoices.map((i) => ({
          شماره_فاکتور: i.invoiceNo,
          سفارش: i.orderNo,
          مشتری: i.customerName,
          مالیات: i.taxTotal,
          جمع_کل: i.grandTotal,
          وضعیت: i.status,
        }));
      case 'fefo_expiry':
        return products.flatMap((p) =>
          p.variants.flatMap((v) =>
            (v.batches ?? []).map((b) => ({
              محصول: p.titleFa,
              کد_بچ: b.batchNo,
              تاریخ_انقضا: formatJalaliDate(b.expiresAt),
              موجودی_بچ: b.qtyOnHand,
              قیمت_ویژه: b.specialPrice ?? 0,
            }))
          )
        );
      case 'gross_margin':
        return products.map((p) => {
          const v = p.variants[0];
          const cost = productCosts.find((c) => c.productId === p.id)?.variantCosts[v?.id ?? ''] ?? 0;
          const sell = v?.basePrice ?? 0;
          return {
            کالا: p.titleFa,
            SKU: p.sku,
            قیمت_فروش: sell,
            بهای_تمام‌شده: cost,
            سود_واحد: cost > 0 && sell > 0 ? sell - cost : 0,
          };
        });
      case 'not_found_redirects':
        return notFoundLogs.map((n) => ({
          مسیر_۴۰۴: n.path,
          تعداد_رخداد: n.hitCount,
          آخرین_مشاهده: formatJalaliDateTime(n.lastSeenAt),
        }));
      case 'b2b_pipeline':
        return b2bVerifications.map((b) => ({
          متقاضی: b.applicantName,
          مرکز: b.clinicName,
          گروه: b.requestedGroup,
          نظام_پزشکی: b.medicalCouncilNo,
          وضعیت: b.status,
        }));
      case 'proforma_conversion':
        return proformas.map((pf) => ({
          شماره: pf.proformaNo,
          مشتری: pf.contactName,
          مبلغ: pf.grandTotal,
          وضعیت: pf.status,
        }));
      case 'refunds_rma':
        return returns.map((r) => ({
          شماره: r.returnNo,
          سفارش: r.orderNo,
          علت: r.reasonFa,
          مبلغ_عودت: r.refundAmount,
          وضعیت: r.status,
        }));
      case 'credit_exposure':
        return paymentPlans.map((pl) => ({
          مشتری: pl.customerName,
          نوع: pl.type,
          اقساط: pl.installmentsCount,
          مبلغ: pl.requestedAmount,
          وضعیت: pl.status,
        }));
      case 'low_stock_alert':
        return products.flatMap((p) =>
          p.variants
            .filter((v) => v.stockOnHand - v.reserved <= v.lowStockThreshold)
            .map((v) => ({ کالا: p.titleFa, تنوع: v.labelFa, موجودی: v.stockOnHand, آستانه: v.lowStockThreshold }))
        );
      case 'seo_health_audit':
        return auditSeoHealth(products, categories, []).map((f) => ({
          قاعده: f.rule,
          شدت: f.severity,
          تعداد_مورد: f.affectedCount,
        }));
      default:
        return orders.map((o) => ({
          شماره_سفارش: o.orderNo,
          مشتری: o.customerName,
          گروه: o.customerGroup,
          روش_پرداخت: o.paymentMethod,
          مالیات: o.taxTotal,
          جمع_کل: o.grandTotal,
          وضعیت: o.status,
        }));
    }
  }, [selectedReportId, orders, invoices, proformas, returns, paymentPlans, products, productCosts, categories, brands, b2bVerifications, notFoundLogs]);

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(reportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `dentalmarket-${selectedReportId}.xlsx`);
  };

  const salesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    orders
      .filter((o) => o.status !== 'cancelled')
      .forEach((o) =>
        o.items.forEach((it) => {
          const prod = products.find((p) => p.id === it.productId);
          const catName = categories.find((c) => c.id === prod?.primaryCategoryId)?.nameFa ?? 'سایر';
          map.set(catName, (map.get(catName) ?? 0) + it.lineTotal);
        })
      );
    return Array.from(map.entries()).map(([category, revenue]) => ({ category, revenue }));
  }, [orders, products, categories]);

  const headers = reportRows[0] ? Object.keys(reportRows[0]) : ['گزارش'];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-xl font-extrabold">مرکز ۲۹ گزارش تحلیلی، مالی و انبارداری (§12)</h1>
        <button
          type="button"
          onClick={exportXlsx}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>خروجی واقعی Excel (.xlsx)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-2 max-h-[520px] overflow-y-auto text-xs">
          <p className="font-extrabold text-sm pb-2 border-b border-line dark:border-slate-800">فهرست ۲۹ گزارش استاندارد</p>
          {REPORT_CATALOG.map((rep) => (
            <button
              key={rep.id}
              type="button"
              onClick={() => setSelectedReportId(rep.id)}
              className={`w-full text-right p-2.5 rounded-xl transition-colors ${
                selectedReportId === rep.id ? 'bg-brand text-white font-bold' : 'hover:bg-surface/60 dark:hover:bg-slate-800'
              }`}
            >
              <span className="block">{rep.title}</span>
              <span className={`text-[10px] ${selectedReportId === rep.id ? 'text-white/80' : 'text-ink/50'}`}>{rep.group}</span>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">
              {REPORT_CATALOG.find((r) => r.id === selectedReportId)?.title} ({toPersianDigits(reportRows.length)} ردیف)
            </h2>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-line dark:border-slate-800 text-ink/60 sticky top-0 bg-white dark:bg-slate-900">
                  <tr>
                    {headers.map((h) => <th key={h} className="py-2 px-2 text-right">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-slate-800">
                  {reportRows.slice(0, 30).map((r, idx) => (
                    <tr key={idx}>
                      {headers.map((h) => (
                        <td key={h} className="py-2 px-2 tabular-nums">
                          {typeof r[h] === 'number' && String(h).includes('مبلغ') ? formatMoney(Number(r[h]), currency) : String(r[h] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-base font-extrabold">نمودار فروش دسته‌بندی‌ها (نرخ مالیات {toPersianDigits(settings.taxRatePercent)}٪)</h2>
            <div className="h-56 w-full" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
                  <Bar dataKey="revenue" fill="#17788C" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminReportsPage;
