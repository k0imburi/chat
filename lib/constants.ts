import {
  BellRing,
  CreditCard,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react"

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "ChatAndTip Admin"
export const SESSION_COOKIE = "chatandtip_admin_session"

export const NAV_ITEMS = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Users", url: "/users", icon: Users },
  { title: "Reports", url: "/reports", icon: TriangleAlert },
  { title: "Payment Plans", url: "/payment-plans", icon: CreditCard },
  { title: "Notifications", url: "/notifications", icon: BellRing },
  { title: "Settings", url: "/settings", icon: Settings },
]

export const ADMIN_ROLE_OPTIONS = [
  { label: "Super Admin", value: "SUPER_ADMIN" },
  { label: "Admin", value: "ADMIN" },
  { label: "Support", value: "SUPPORT" },
]

export const NOTIFICATION_CHANNEL_OPTIONS = [
  { label: "In App", value: "IN_APP" },
  { label: "Email", value: "EMAIL" },
  { label: "SMS", value: "SMS" },
  { label: "Webhook", value: "WEBHOOK" },
]

export const PLAN_INTERVAL_OPTIONS = [
  { label: "One time", value: "ONE_TIME" },
  { label: "Daily", value: "DAILY" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Monthly", value: "MONTHLY" },
  { label: "Yearly", value: "YEARLY" },
]

export const STATUS_OPTIONS = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Blocked", value: "BLOCKED" },
  { label: "Reported", value: "REPORTED" },
]

export const USER_FILTER_OPTIONS = [
  { label: "Name", value: "fullName" },
  { label: "Email", value: "email" },
  { label: "Phone", value: "phoneNumber" },
  { label: "Country", value: "country" },
  { label: "City", value: "city" },
  { label: "User ID", value: "id" },
]

export const DEFAULT_PAGE_SIZE = 10

export const SETTINGS_TABS = [
  { value: "general", label: "General" },
  { value: "features", label: "Features" },
  { value: "payments", label: "Payments" },
  { value: "storage", label: "Storage" },
  { value: "notifications", label: "Notifications" },
  { value: "security", label: "Security" },
  { value: "admins", label: "Admins" },
]

export const ADMIN_BADGE_STYLES: Record<string, string> = {
  SUPER_ADMIN: "rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  ADMIN: "rounded-full border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
  SUPPORT: "rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
}

export const STATUS_BADGE_STYLES: Record<string, string> = {
  ACTIVE: "rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  BLOCKED: "rounded-full border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  REPORTED: "rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  HIDDEN: "rounded-full border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400",
}

export const SHIELD_ICON = ShieldCheck
