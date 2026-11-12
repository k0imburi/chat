"use client"

import { useEffect, useState } from "react"
import { BellRing, Check, LoaderCircle, Volume2, Vibrate } from "lucide-react"

type Preferences = Record<string, boolean | string | undefined>
const categories = [
  ["message", "Messages", "New chats, replies and privacy requests"],
  ["booking", "Calls and bookings", "Scheduled sessions and call updates"],
  ["tip", "Tips and payments", "Tips, credits and wallet activity"],
  ["social", "Social activity", "Follows, likes and reshares"],
  ["post", "Posts", "Comments, tags and post updates"],
  ["system", "Account and support", "Security, verification and support replies"],
] as const

export function NotificationPreferences() {
  const [value,setValue]=useState<Preferences>({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false)
  useEffect(()=>{void fetch("/api/mobile/notification-preferences").then(r=>r.json()).then(data=>setValue(data.preferences||{})).finally(()=>setLoading(false))},[])
  async function update(patch:Preferences){const next={...value,...patch};setValue(next);setSaving(true);setSaved(false);const response=await fetch("/api/mobile/notification-preferences",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({preferences:patch})});setSaving(false);setSaved(response.ok)}
  if(loading)return <div className="grid min-h-64 place-items-center"><LoaderCircle className="h-6 w-6 animate-spin text-[#16a653]"/></div>
  return <div className="space-y-4">
    <Setting icon={<BellRing/>} title="Notifications" detail="Master control for account alerts" enabled={value.notificationsEnabled!==false} onChange={enabled=>void update({notificationsEnabled:enabled})}/>
    <div className="overflow-hidden rounded-[24px] border border-black/10 bg-white dark:border-white/10 dark:bg-[#101312]">{categories.map(([key,title,detail])=><Setting key={key} title={title} detail={detail} enabled={value[key]!==false} onChange={enabled=>void update({[key]:enabled})}/>)}</div>
    <div className="overflow-hidden rounded-[24px] border border-black/10 bg-white dark:border-white/10 dark:bg-[#101312]"><Setting icon={<Vibrate/>} title="Vibration" detail="Vibrate for supported browser notifications" enabled={value.vibrationEnabled!==false} onChange={enabled=>void update({vibrationEnabled:enabled})}/><div className="flex items-center gap-3 border-t border-black/[.06] px-5 py-4 dark:border-white/[.07]"><Volume2 className="h-5 w-5 text-[#16a653]"/><div className="flex-1"><p className="text-sm font-extrabold">Notification sound</p><p className="text-xs text-black/40 dark:text-white/40">Used by supported devices and installed web apps</p></div><select value={String(value.soundId||"default")} onChange={event=>void update({soundId:event.target.value})} className="h-10 rounded-xl border border-black/10 bg-transparent px-3 text-sm dark:border-white/10"><option value="default">Default</option><option value="cat_pulse">Pulse</option><option value="cat_ripple">Ripple</option><option value="cat_glow">Glow</option><option value="cat_chime">Chime</option></select></div></div>
    <p className="flex h-5 items-center justify-end gap-1 text-xs font-semibold text-[#16a653]">{saving?<><LoaderCircle className="h-3.5 w-3.5 animate-spin"/>Saving…</>:saved?<><Check className="h-3.5 w-3.5"/>Saved</>:null}</p>
  </div>
}

function Setting({icon,title,detail,enabled,onChange}:{icon?:React.ReactNode;title:string;detail:string;enabled:boolean;onChange:(enabled:boolean)=>void}){return <div className="flex items-center gap-3 border-b border-black/[.06] px-5 py-4 last:border-0 dark:border-white/[.07]">{icon?<span className="h-5 w-5 text-[#16a653]">{icon}</span>:null}<div className="min-w-0 flex-1"><p className="text-sm font-extrabold">{title}</p><p className="mt-0.5 text-xs text-black/40 dark:text-white/40">{detail}</p></div><button type="button" role="switch" aria-checked={enabled} onClick={()=>onChange(!enabled)} className={`relative h-7 w-12 rounded-full transition ${enabled?"bg-[#25d366]":"bg-black/15 dark:bg-white/20"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${enabled?"left-6":"left-1"}`}/></button></div>}
