import Image from "next/image"
import { LoginForm } from "@/components/login-form"
import { CustomerLoginForm } from "@/components/customer-login-form"
import { headers } from "next/headers"

export default async function LoginPage() {
  const hostname = (await headers()).get("host")?.split(":")[0]?.toLowerCase() || ""
  const customerHost = (process.env.CUSTOMER_HOST || "www.chatandtip.com").toLowerCase()
  const apexHost = (process.env.ROOT_HOST || "chatandtip.com").toLowerCase()
  const isCustomerHost = hostname === customerHost || hostname === apexHost
  const isAdmin = !isCustomerHost && (hostname === (process.env.ADMIN_HOST || "admin.chatandtip.com").toLowerCase() || hostname === "admin.localhost")
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#fcfffd_0%,#f5fbf7_48%,#fdfefd_100%)] px-4 py-10 sm:px-6 dark:bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.25)_100%)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(34,197,94,0.08),transparent_30%),radial-gradient(circle_at_80%_22%,rgba(74,222,128,0.06),transparent_26%),radial-gradient(circle_at_50%_100%,rgba(34,197,94,0.05),transparent_34%),radial-gradient(circle_at_top,rgba(255,255,255,0.88),transparent_34%)] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.04),transparent_36%)]" />
      <section className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        {isAdmin ? <LoginForm /> : <CustomerLoginForm />}

        {isAdmin ? <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">Access is restricted to authorized administrators. Use your assigned credentials to continue.</p> : null}
      </section>
    </main>
  )
}
