import { ZodError } from "zod"

export type ActionResult = {
  success: boolean
  message?: string
}

export const initialActionResult: ActionResult = {
  success: false,
}

export function getActionFormData(
  stateOrFormData: ActionResult | FormData,
  maybeFormData?: FormData,
) {
  return stateOrFormData instanceof FormData ? stateOrFormData : maybeFormData!
}

export function successResult(message: string): ActionResult {
  return {
    success: true,
    message,
  }
}

export function errorResult(error: unknown, fallbackMessage: string): ActionResult {
  if (error instanceof ZodError) {
    return {
      success: false,
      message: error.issues[0]?.message ?? fallbackMessage,
    }
  }

  if (error instanceof Error) {
    return {
      success: false,
      message: error.message || fallbackMessage,
    }
  }

  return {
    success: false,
    message: fallbackMessage,
  }
}
