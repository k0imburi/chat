"use client"

import type { ComponentProps } from "react"
import { LoaderCircle } from "lucide-react"
import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

type Props = ComponentProps<typeof Button> & {
  pendingText?: string
}

export function SubmitButton({ children, pendingText = "Saving...", ...props }: Props) {
  const { pending } = useFormStatus()

  return (
    <Button {...props} disabled={pending || props.disabled}>
      {pending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : children}
    </Button>
  )
}
