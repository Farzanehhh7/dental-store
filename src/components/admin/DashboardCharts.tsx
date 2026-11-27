import { Link } from 'react-router-dom';
import { ArrowUpLeft } from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../../context/i18n';
import type { CurrencyMode } from '../../types/domain';

const CHART_COLORS = ['#17788C', '#0F5667', '#2A9D8F', '#E9C46A', '#E76F51', '#64748B', '#8B5CF6'];

export interface DashboardChartsProps {
  currency: CurrencyMode;
  salesTrendData: Array<{ label: string; revenue: number; orders: number }>;
  b2bVsB2cData: Array<{ name: string; value: number }>;
  categoryRevenueData: Array<{ name: string; revenue: number }>;
  brandRevenueData: Array<{ name: string; revenue: number }>;
  groupSplitData: Array<{ group: string; revenue: number }>;
  topProductsData: Array<{ name: string; sold: number }>;
  expiryRiskBuckets: Array<{ bucket: string; qty: number }>;
  paymentMethodData: Array<{ name: string; value: number }>;
  statusDonutData: Array<{ name: string; value: number }>;
  provinceSalesData: Array<{ province: string; revenue: number }>;
}

export default function DashboardCharts({
  currency,
  salesTrendData,
  b2bVsB2cData,
  categoryRevenueData,
  brandRevenueData,
  groupSplitData,
  topProductsData,
  expiryRiskBuckets,
  paymentMethodData,
  statusDonutData,
  provinceSalesData,
}: DashboardChartsProps) {
  const { t, formatMoney, formatNumber } = useI18n();

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold">{t('adminDash.charts.salesTrendTitle')}</h2>
          <Link to="/admin/reports" className="text-xs font-bold text-brand inline-flex items-center gap-1">
            <span>{t('adminDash.charts.reportsLink')}</span>
            <ArrowUpLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="h-64 w-full" dir="ltr">
          {salesTrendData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-ink/65 dark:text-slate-400">
              {t('adminDash.charts.noRangeData')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatNumber(Number(v))} />
                <Tooltip formatter={(val) => formatMoney(Number(val), currency)} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  fill="#17788C22"
                  stroke="#17788C"
                  strokeWidth={2}
                  name={t('adminDash.charts.seriesSales')}
                />
                <Bar dataKey="orders" fill="#0F5667" barSize={18} name={t('adminDash.charts.seriesOrders')} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.b2bShareTitle')}</h2>
        <div className="h-64 w-full" dir="ltr">
          {b2bVsB2cData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-ink/65 dark:text-slate-400">
              {t('common.noData')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={b2bVsB2cData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={4}>
                  {b2bVsB2cData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.categoryRevenueTitle')}</h2>
        <div className="h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryRevenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatNumber(Number(v))} />
              <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              <Bar dataKey="revenue" fill="#17788C" radius={[4, 4, 0, 0]} name={t('adminDash.charts.seriesRevenue')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.brandAndGroupTitle')}</h2>
        <div className="h-56 w-full grid grid-cols-2 gap-3" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={brandRevenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              <Bar dataKey="revenue" fill="#2A9D8F" radius={[4, 4, 0, 0]} name={t('adminDash.charts.seriesBrand')} />
            </BarChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={groupSplitData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey="group" tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
              <Bar dataKey="revenue" fill="#0F5667" radius={[4, 4, 0, 0]} name={t('adminDash.charts.seriesGroup')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.topProductsTitle')}</h2>
        <div className="h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProductsData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
              <Tooltip />
              <Bar dataKey="sold" fill="#17788C" radius={[0, 4, 4, 0]} name={t('adminDash.charts.seriesCount')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.expiryRiskTitle')}</h2>
        <div className="h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={expiryRiskBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="qty" fill="#E76F51" radius={[4, 4, 0, 0]} name={t('adminDash.charts.seriesRiskQty')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-5 space-y-4">
        <h2 className="text-base font-extrabold">{t('adminDash.charts.paymentAndProvinceTitle')}</h2>
        <div className="h-56 w-full grid grid-cols-2 gap-2" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={paymentMethodData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={56}>
                {paymentMethodData.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={statusDonutData} dataKey="value" nameKey="name" innerRadius={28} outerRadius={56}>
                {statusDonutData.map((_, idx) => (
                  <Cell key={idx} fill={CHART_COLORS[(idx + 2) % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-ink/70 dark:text-slate-400 truncate">
          {t('adminDash.charts.topProvincesLabel', {
            provinces: provinceSalesData.map((p) => p.province).join(' · ') || t('common.tehran'),
          })}
        </p>
      </div>
    </section>
  );
}
