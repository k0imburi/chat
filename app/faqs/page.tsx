import { PublicPageFrame, PublicText } from "@/components/public-page-frame"
export const metadata = { title: "FAQs — ChatAndTip" }
export default function FaqPage() {
  return <PublicPageFrame titleKey="web.faq"><div className="space-y-4">
    {([1,2,3,4] as const).map(index => <details key={index} className="group rounded-2xl border border-slate-200 p-5 open:bg-emerald-50/60">
      <summary className="cursor-pointer text-lg font-bold text-emerald-950"><PublicText message={`web.faq${index}q`}/></summary>
      <p className="mt-4 max-w-prose leading-8 text-slate-600"><PublicText message={`web.faq${index}a`}/></p>
    </details>)}
  </div></PublicPageFrame>
}
