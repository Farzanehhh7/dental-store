import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../../context/i18n';
import type { CurrencyMode } from '../../types/domain';
import type { ReportResult } from '../../pages/admin/reports';

export default function ReportChart({
  chart,
  currency,
}: {
  chart: NonNullable<ReportResult['chart']>;
  currency: CurrencyMode;
}) {
  const { formatMoney, formatDigits } = useI18n();

  return (
    <div className="bg-white dark:bg-slate-900 border border-line dark:border-slate-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-extrabold text-ink dark:text-slate-100">{chart.title}</h3>
      <div className="h-60 w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === 'line' ? (
            <LineChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) =>
                  chart.valueType === 'money'
                    ? formatMoney(Number(v), currency)
                    : formatDigits(String(v))
                }
              />
              <Line
                type="monotone"
                dataKey={chart.yKey}
                stroke="#17788C"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          ) : (
            <BarChart data={chart.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D6E2E6" />
              <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) =>
                  chart.valueType === 'money'
                    ? formatMoney(Number(v), currency)
                    : formatDigits(String(v))
                }
              />
              <Bar dataKey={chart.yKey} fill="#17788C" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
