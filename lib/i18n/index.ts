import { messages, supportedLocales, type MessageKey, type SupportedLocale } from "@/lib/i18n/generated"

export { supportedLocales, type MessageKey, type SupportedLocale }

export function normalizeLocale(value?: string | null): SupportedLocale {
  const candidate = String(value || "").toLowerCase().split(/[-_]/)[0]
  return supportedLocales.includes(candidate as SupportedLocale) ? candidate as SupportedLocale : "en"
}

export function translate(locale: SupportedLocale, key: MessageKey, values: Record<string, string | number> = {}) {
  let message: string = messages[locale][key] || messages.en[key]
  for (const [name, value] of Object.entries(values)) message = message.replaceAll(`{${name}}`, String(value))
  return message
}
