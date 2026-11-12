import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { NotificationPreferences } from "@/components/customer/notification-preferences"
import { getCurrentCustomerUser } from "@/lib/customer-web"

export default async function NotificationSettingsPage(){const user=await getCurrentCustomerUser();if(!user)return <CustomerShell active="/account" signedIn={false}><SignInRequired/></CustomerShell>;return <CustomerShell active="/account" signedIn><div className="mx-auto max-w-2xl"><header className="mb-5 flex items-center gap-3"><Link href="/account" aria-label="Back to account" className="grid h-11 w-11 place-items-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"><ArrowLeft className="h-5 w-5"/></Link><div><h1 className="text-2xl font-black">Notifications</h1><p className="text-sm text-black/45 dark:text-white/45">Control alerts across app and web</p></div></header><NotificationPreferences/></div></CustomerShell>}
