import { PublicPageFrame, PublicText } from "@/components/public-page-frame"
export const metadata = { title: "About ChatAndTip", description: "Discover creators, conversations and community on ChatAndTip." }
export default function AboutPage() {
  return <PublicPageFrame titleKey="web.about">
    <p className="max-w-2xl text-xl leading-9 text-slate-600"><PublicText message="web.aboutBody"/></p>
    <div className="mt-10 grid gap-4 sm:grid-cols-3">
      {(["web.discover", "web.community", "web.chats"] as const).map(key =>
        <div key={key} className="rounded-2xl border border-emerald-100 bg-emerald-50 p-6 text-lg font-bold text-emerald-950"><PublicText message={key}/></div>)}
    </div>
  </PublicPageFrame>
}
