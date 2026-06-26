import fs from "node:fs"

function parseEnvFile(path) {
  if (!fs.existsSync(path)) return {}
  const env = {}
  for (const rawLine of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const index = line.indexOf("=")
    if (index < 0) continue
    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    value = value.replace(/^["']|["']$/g, "")
    env[key] = value
  }
  return env
}

const local = parseEnvFile(".env.local")
const railway = parseEnvFile(".env.railway")
const env = { ...railway, ...local, ...process.env }

function present(key) {
  return Boolean(String(env[key] || "").trim())
}

const groups = [
  {
    name: "Core app",
    required: ["DATABASE_URL", "JWT_SECRET", "CUSTOMER_JWT_SECRET", "APP_URL"],
  },
  {
    name: "M-PESA STK",
    required: [
      "MPESA_ENABLED",
      "MPESA_CONFIG_SOURCE",
      "MPESA_ENVIRONMENT",
      "MPESA_CONSUMER_KEY",
      "MPESA_CONSUMER_SECRET",
      "MPESA_SHORTCODE",
      "MPESA_PASSKEY",
    ],
  },
  {
    name: "R2 uploads/private media",
    required: [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_PRIVATE_BUCKET_NAME",
      "R2_PUBLIC_BASE_URL",
    ],
  },
  {
    name: "Jobs",
    required: ["CRON_SECRET"],
  },
  {
    name: "Agora browser sessions",
    required: ["AGORA_APP_ID"],
    optional: ["AGORA_APP_CERTIFICATE"],
  },
  {
    name: "M-PESA B2C payouts",
    required: [
      "MPESA_B2C_INITIATOR_NAME",
      "MPESA_B2C_SECURITY_CREDENTIAL",
      "MPESA_B2C_SHORTCODE",
    ],
  },
]

let failed = false

console.log("ChatAndTip test readiness\n")
for (const group of groups) {
  const missing = group.required.filter((key) => !present(key))
  const optionalMissing = (group.optional || []).filter((key) => !present(key))
  if (missing.length) failed = true
  console.log(`${missing.length ? "✗" : "✓"} ${group.name}`)
  if (missing.length) console.log(`  Missing: ${missing.join(", ")}`)
  if (optionalMissing.length) console.log(`  Optional missing: ${optionalMissing.join(", ")}`)
}

console.log("\nProvider flags")
console.log(`  M-PESA enabled: ${env.MPESA_ENABLED === "true" ? "yes" : "no"}`)
console.log(`  M-PESA environment: ${env.MPESA_ENVIRONMENT || "not set"}`)
console.log(`  Stripe enabled: ${env.STRIPE_ENABLED === "true" ? "yes" : "no"}`)

if (failed) {
  console.log("\nSome provider values are missing. Safe local build/tests can still run, but end-to-end provider testing will fail closed.")
  process.exitCode = 1
} else {
  console.log("\nReady for provider smoke tests after the database migration is applied.")
}
