import type { ReactNode } from "react"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export function AppModal({
  trigger,
  title,
  description,
  children,
  footer,
  contentClassName,
  bodyClassName,
}: {
  trigger: ReactNode
  title: string
  description?: string
  children: ReactNode
  /** Action buttons rendered in the footer (e.g. submit button). A Cancel button is always included. */
  footer?: ReactNode
  contentClassName?: string
  bodyClassName?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={contentClassName ?? "sm:w-[760px]"}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className={bodyClassName}>{children}</DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
