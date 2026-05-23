"use client"

import Image from "next/image"
import { useActionState, useEffect } from "react"
import { LockKeyhole, Mail } from "lucide-react"
import { useFormStatus } from "react-dom"
import { loginAction, type LoginActionState } from "@/lib/actions/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

const initialState: LoginActionState = {
  success: false,
}

function LoginActionButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="h-11 w-full rounded-xl" size="lg" disabled={pending}>
      {pending ? "Signing in..." : "Login"}
    </Button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState)

  useEffect(() => {
    if (state.success && state.redirectTo) {
      window.location.href = state.redirectTo
    }
  }, [state])

  return (
    <Card className="w-full rounded-2xl border bg-card/95 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <CardHeader className="space-y-3 pb-0 text-center">
        <div className="flex justify-center">
          <Image
            src="/chatandtip-logo-v2.png"
            alt="ChatAndTip"
            width={220}
            height={64}
            className="h-14 w-auto object-contain sm:h-16"
            priority
          />
        </div>
        {/* <CardTitle className="text-3xl font-semibold tracking-tight">Welcome back</CardTitle> */}
        <CardDescription className="text-base leading-7">
          Sign in with your admin email and password to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {/* <div className="relative flex items-center justify-center">
          <Separator />
          <span className="absolute bg-card px-3 text-sm text-muted-foreground">Admin credentials</span>
        </div> */}

        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@chatandtip.com"
                className="h-11 rounded-xl border-border/70 pl-10 shadow-none"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <span className="text-sm text-muted-foreground">Secure access</span>
            </div>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="password" name="password" type="password" className="h-11 rounded-xl border-border/70 pl-10 shadow-none" required minLength={6} />
            </div>
          </div>

          {state.message ? (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <LoginActionButton />
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Managed access for platform operators only.
        </p>
      </CardContent>
    </Card>
  )
}
