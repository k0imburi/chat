import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CreditCard,
  Users,
  Video,
  Bell,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { getDashboardData } from "@/lib/dashboard"
import { formatRelative } from "@/lib/format"
import {
  GenderDonut,
  StatusDonut,
  HorizontalBars,
  GEO_COLOR,
  PLATFORM_COLOR,
  UserGrowthChart,
} from "@/components/dashboard-charts"
import { DashboardGreeting } from "@/components/dashboard-greeting"

function nameColor(name: string) {
  const palette = ["#6366f1", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#06b6d4", "#f97316", "#8b5cf6"]
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return palette[Math.abs(h) % palette.length]
}

function nameInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function growthBadge(current: number, previous: number) {
  if (previous === 0) return null
  const diff = current - previous
  const pct = Math.round(Math.abs((diff / previous) * 100))
  return { up: diff >= 0, pct }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const statusData = [
    { name: "Active", value: data.totals.activeUsers },
    { name: "Blocked", value: data.totals.blockedUsers },
    { name: "Reported", value: data.totals.reportedUsers },
    { name: "Hidden", value: data.totals.hiddenUsers },
  ].filter((d) => d.value > 0)

  const genderData = [
    { name: "Male", value: data.totals.maleUsers },
    { name: "Female", value: data.totals.femaleUsers },
    {
      name: "Other",
      value: Math.max(0, data.totals.totalUsers - data.totals.maleUsers - data.totals.femaleUsers),
    },
  ].filter((d) => d.value > 0)

  const verifiedPct =
    data.totals.totalUsers > 0
      ? Math.round((data.totals.verifiedUsers / data.totals.totalUsers) * 100)
      : 0

  const growth = growthBadge(data.totals.newUsersThisMonth, data.totals.newUsersLastMonth)

  return (
    <div className="space-y-5">

      {/* ── Greeting row ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <DashboardGreeting />

        {/* Month pill */}
        <div className="flex w-fit items-center gap-4 rounded-lg border border-border bg-card px-5 py-3.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">New this month</p>
            <p className="mt-1 text-2xl font-bold tabular-nums leading-none">{data.totals.newUsersThisMonth}</p>
          </div>
          {growth ? (
            <div
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                growth.up
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400"
              }`}
            >
              {growth.up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {growth.pct}%
            </div>
          ) : (
            <TrendingUp className="h-5 w-5 text-muted-foreground/40" />
          )}
        </div>
      </div>

      {/* ── Stat cards — colored gradient, flat, sm radius ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            title: "Total users",
            value: data.totals.totalUsers,
            hint: `${data.totals.activeUsers} active · ${verifiedPct}% verified`,
            icon: Users,
            grad: "from-violet-600 to-indigo-600",
          },
          {
            title: "Open reports",
            value: data.totals.reportsCount,
            hint: `${data.totals.reportedUsers} flagged · ${data.totals.blockedUsers} blocked`,
            icon: AlertTriangle,
            grad: "from-rose-500 to-pink-600",
          },
          {
            title: "Media uploads",
            value: data.totals.mediaCount,
            hint: `${data.totals.verifiedUsers} verified profiles`,
            icon: Video,
            grad: "from-emerald-500 to-teal-600",
          },
          {
            title: "Payment plans",
            value: data.totals.paymentPlans,
            hint: `${data.totals.notifications} campaigns sent`,
            icon: CreditCard,
            grad: "from-amber-500 to-orange-500",
          },
        ].map((card) => (
          <div
            key={card.title}
            className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${card.grad} p-5 text-white`}
          >
            <div className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10" />
            <div className="pointer-events-none absolute -bottom-5 right-1 h-20 w-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between">
              <p className="text-xs font-medium text-white/75 uppercase tracking-wide">{card.title}</p>
              <card.icon className="h-4 w-4 text-white/60" />
            </div>
            <p className="relative mt-3 text-4xl font-bold tabular-nums">{card.value}</p>
            <p className="relative mt-2 text-[11px] text-white/60">{card.hint}</p>
          </div>
        ))}
      </div>

      {/* ── Quick stats strip ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Verified", value: data.totals.verifiedUsers, icon: ShieldCheck, iconColor: "#10b981", pill: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400" },
          { label: "Blocked", value: data.totals.blockedUsers, icon: AlertTriangle, iconColor: "#ef4444", pill: "bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400" },
          { label: "Hidden", value: data.totals.hiddenUsers, icon: Video, iconColor: "#94a3b8", pill: "bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400" },
          { label: "Campaigns", value: data.totals.notifications, icon: Bell, iconColor: "#6366f1", pill: "bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-400" },
        ].map(({ label, value, icon: Icon, iconColor, pill }) => (
          <div key={label} className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${pill}`}>
              <Icon className="h-4 w-4" style={{ color: iconColor }} />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main row: growth chart + status donut ── */}
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>User growth</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Registrations, last 12 months</p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400">
                12 mo
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <UserGrowthChart data={data.monthlyGrowth} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/60">
            <CardTitle>Account status</CardTitle>
            <p className="text-xs text-muted-foreground">By user status</p>
          </CardHeader>
          <CardContent className="pt-4">
            {statusData.length > 0 ? (
              <StatusDonut data={statusData} total={data.totals.totalUsers} />
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom grid ── */}
      <div className="grid gap-4 xl:grid-cols-3">

        {/* Recent users */}
        <Card>
          <CardHeader className="border-b border-border/60">
            <div className="flex items-center justify-between">
              <CardTitle>Recent users</CardTitle>
              <Link href="/users" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">Latest accounts</p>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/50">
              {data.newestUsers.slice(0, 6).map((user) => {
                const color = nameColor(user.fullName)
                const initials = nameInitials(user.fullName)
                const location = [user.city, user.country].filter(Boolean).join(", ") || "—"
                return (
                  <li key={user.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/30">
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/users/${user.id}`} className="block truncate text-sm font-medium hover:text-primary">
                        {user.fullName}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{location}</p>
                    </div>
                    <StatusBadge value={user.status} />
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Top countries */}
        <Card>
          <CardHeader className="border-b border-border/60">
            <CardTitle>Top countries</CardTitle>
            <p className="text-xs text-muted-foreground">By user count</p>
          </CardHeader>
          <CardContent className="pt-4">
            {data.countryStats.length > 0 ? (
              <HorizontalBars data={data.countryStats} total={data.totals.totalUsers} color={GEO_COLOR} />
            ) : (
              <p className="text-sm text-muted-foreground">No data.</p>
            )}
          </CardContent>
        </Card>

        {/* Gender + Platform stacked */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b border-border/60">
              <CardTitle>Gender</CardTitle>
              <p className="text-xs text-muted-foreground">User split</p>
            </CardHeader>
            <CardContent className="pt-4">
              {genderData.length > 0 ? (
                <GenderDonut data={genderData} total={data.totals.totalUsers} />
              ) : (
                <p className="text-sm text-muted-foreground">No data.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/60">
              <CardTitle>Device platform</CardTitle>
              <p className="text-xs text-muted-foreground">By OS</p>
            </CardHeader>
            <CardContent className="pt-4">
              {data.platformStats.length > 0 ? (
                <HorizontalBars data={data.platformStats} total={data.totals.totalUsers} color={PLATFORM_COLOR} />
              ) : (
                <p className="text-sm text-muted-foreground">No data.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
