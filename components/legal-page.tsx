import type { ReactNode } from "react"
import { OfficialPolicyNotice, PublicPageFrame } from "@/components/public-page-frame"

export function LegalPage({ title, effectiveDate, children }: {
  title: string; effectiveDate?: string; children: ReactNode
}) {
  const titleKey = title.includes("Privacy") ? "web.privacy" : title.includes("Terms") ? "web.terms" : "web.about"
  return <PublicPageFrame titleKey={titleKey}>
    {effectiveDate && <p className="mb-6 text-sm text-slate-500">{effectiveDate}</p>}
    <OfficialPolicyNotice/>
    <div lang="en" dir="ltr" className="legal-body max-w-prose space-y-8">{children}</div>
  </PublicPageFrame>
}
export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="text-xl font-bold tracking-tight text-emerald-950">{children}</h2>
}
export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-base leading-8 text-slate-600">{children}</p>
}
export function LegalUl({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-3 pl-5 text-base leading-8 text-slate-600">{children}</ul>
}
