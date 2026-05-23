"use client"

import type { ComponentProps } from "react"
import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import {
  initialActionResult,
  type ActionResult,
} from "@/lib/actions/action-result"

type ActionFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: (
    state: ActionResult,
    formData: FormData,
  ) => Promise<ActionResult>
  successMessage?: string
  errorMessage?: string
  onSuccess?: () => void
}

export function ActionForm({
  action,
  successMessage,
  errorMessage,
  onSuccess,
  children,
  ...props
}: ActionFormProps) {
  const [state, formAction] = useActionState(action, initialActionResult)

  useEffect(() => {
    if (!state.message) {
      return
    }

    if (state.success) {
      toast.success(successMessage ?? state.message)
      onSuccess?.()
      return
    }

    toast.error(errorMessage ?? state.message)
  }, [errorMessage, onSuccess, state, successMessage])

  return (
    <form action={formAction} {...props}>
      {children}
    </form>
  )
}
