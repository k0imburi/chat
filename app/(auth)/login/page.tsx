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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f7f5] px-4 py-10 dark:bg-[#080b0a] sm:px-6">
      <section className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        {isAdmin ? <LoginForm /> : <CustomerLoginForm />}

        {isAdmin ? <p className="max-w-sm text-center text-sm leading-6 text-muted-foreground">Access is restricted to authorized administrators. Use your assigned credentials to continue.</p> : null}
      </section>
    </main>
  )
}
