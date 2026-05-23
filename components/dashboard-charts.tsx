"use client"

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"

export const STATUS_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#94a3b8"]
export const GENDER_COLORS = ["#3b82f6", "#ec4899", "#94a3b8"]
export const GEO_COLOR = "#10b981"
export const PLATFORM_COLOR = "#8b5cf6"

function DonutChart({
  data,
  colors,
  total,
}: {
  data: { name: string; value: number }[]
  colors: string[]
  total: number
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d, i) => [d.name, { label: d.name, color: colors[i % colors.length] }]),
  )

  return (
    <div className="flex items-center gap-8">
      <div className="relative h-[156px] w-[156px] shrink-0">
        <ChartContainer config={config} className="h-full w-full">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold tabular-nums leading-none">{total}</span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            total
          </span>
        </div>
      </div>

      <ul className="flex-1 space-y-3">
        {data.map((item, i) => {
          const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0"
          return (
            <li key={item.name} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: colors[i % colors.length] }}
              />
              <span className="flex-1 text-sm text-muted-foreground">{item.name}</span>
              <span className="text-sm font-semibold tabular-nums">{item.value}</span>
              <span className="w-8 text-right text-xs text-muted-foreground/60">{pct}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function StatusDonut({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  return <DonutChart data={data} colors={STATUS_COLORS} total={total} />
}

export function GenderDonut({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  return <DonutChart data={data} colors={GENDER_COLORS} total={total} />
}

export function HorizontalBars({
  data,
  total,
  color,
}: {
  data: { name: string; value: number }[]
  total: number
  color: string
}) {
  return (
    <div className="space-y-4">
      {data.map((item, i) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.name}>
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xs tabular-nums text-muted-foreground/50">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm font-medium">{item.name}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold tabular-nums">{item.value}</span>
                <span className="w-8 text-right text-xs text-muted-foreground/60">{pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(pct, 1.5)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const GROWTH_BAR_COLOR = "#6366f1"

export function UserGrowthChart({ data }: { data: { month: string; users: number }[] }) {
  const config: ChartConfig = {
    users: { label: "New users", color: GROWTH_BAR_COLOR },
  }

  return (
    <ChartContainer config={config} className="h-[200px] w-full">
      <BarChart data={data} barCategoryGap="35%" margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", radius: 4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            return (
              <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-md">
                <p className="font-medium">{label}</p>
                <p className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{payload[0].value}</span> new users
                </p>
              </div>
            )
          }}
        />
        <Bar dataKey="users" fill={GROWTH_BAR_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
