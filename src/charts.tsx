import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Empty } from "./ui";
type Datum = Record<string, string | number | null>;
export function Chart({
  data,
  xKey = "date",
  series,
  type = "line",
  label,
  percent = false,
}: {
  data: Datum[];
  xKey?: string;
  series: { key: string; label: string; color: string }[];
  type?: "line" | "area" | "bar";
  label: string;
  percent?: boolean;
}) {
  if (!data.length || !data.some((d) => series.some((s) => d[s.key] != null)))
    return (
      <Empty title="No measurements yet">
        Analyze a recording or load sample data to see this chart.
      </Empty>
    );
  const props = { data, margin: { top: 10, right: 14, bottom: 8, left: -16 } };
  const common = (
    <>
      <CartesianGrid vertical={false} stroke="#E3E1D8" strokeDasharray="3 4" />
      <XAxis
        dataKey={xKey}
        axisLine={false}
        tickLine={false}
        minTickGap={25}
        tick={{ fill: "#73776D", fontSize: 11 }}
        tickFormatter={(v) =>
          xKey === "seconds"
            ? `${Math.floor(Number(v) / 60)}:${String(Math.round(Number(v) % 60)).padStart(2, "0")}`
            : String(v).slice(5)
        }
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fill: "#73776D", fontSize: 11 }}
        domain={percent ? [0, 100] : [0, "auto"]}
      />
      <Tooltip
        contentStyle={{
          border: "1px solid #E3E1D8",
          borderRadius: 6,
          fontSize: 12,
          background: "#fff",
        }}
        labelFormatter={(v) =>
          xKey === "seconds" ? `${v} seconds` : String(v)
        }
      />
    </>
  );
  return (
    <figure aria-label={label}>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {type === "bar" ? (
            <BarChart {...props}>
              {common}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          ) : type === "area" ? (
            <AreaChart {...props}>
              {common}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  fill="#DCE6D9"
                  fillOpacity={0.5}
                  strokeWidth={2.5}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart {...props}>
              {common}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="linear"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-4 text-xs text-muted mt-3">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="w-3 h-1 rounded" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="sr-only">
          {label}. {data.length} time points. Missing values are not
          interpolated.
        </span>
      </figcaption>
    </figure>
  );
}
