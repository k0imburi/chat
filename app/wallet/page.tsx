import { revalidatePath } from "next/cache"
import Image from "next/image"
import Link from "next/link"
import { VerificationChannel, VerificationPurpose } from "@prisma/client"
import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { KycUploadForm } from "@/components/customer/kyc-upload-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getCurrentCustomerUser, getCustomerWallet } from "@/lib/customer-web"
import { consumeVerificationCode, sendOtpNotification } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { normalizePhoneNumber } from "@/lib/sms"

const creditCards = [
  { key: "keys", label: "Keys", icon: "/icons/economy/key.svg", color: "bg-amber-50" },
  { key: "chatCredits", label: "ChatCredits", icon: "/icons/economy/chat_credit.svg", color: "bg-emerald-50" },
  { key: "voiceSessions", label: "Voice", icon: "/icons/economy/voice_session.svg", color: "bg-blue-50" },
  { key: "videoSessions", label: "Video", icon: "/icons/economy/video_session.svg", color: "bg-purple-50" },
] as const

export default async function WalletPage() {
  const user = await getCurrentCustomerUser()
  if (!user) return <CustomerShell active="/account" signedIn={false}><SignInRequired title="Sign in to see your wallet" /></CustomerShell>
  const wallet = await getCustomerWallet(user.userId)

  return (
    <CustomerShell active="/account" signedIn>
      <div className="space-y-6">
        <section className="rounded-3xl bg-neutral-950 p-6 text-white shadow-xl">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-400">My ChatAndTip</p>
          <h1 className="mt-2 text-3xl font-black">Wallet & earnings</h1>
          <p className="mt-2 text-sm text-white/60">Top up securely on the web with M-PESA, check creator earnings, KYC and payout readiness.</p>
          <Link href="/checkout" className="mt-5 inline-flex rounded-full bg-[#25d366] px-5 py-3 text-sm font-extrabold text-white">Top up with M-PESA</Link>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          {creditCards.map((card) => (
            <div key={card.key} className={`rounded-3xl border border-black/5 ${card.color} p-5 shadow-sm`}>
              <div className="flex items-center justify-between"><p className="font-extrabold">{card.label}</p><Image src={card.icon} alt="" width={28} height={28} /></div>
              <p className="mt-4 text-4xl font-black tabular-nums">{wallet.balances[card.key]}</p>
            </div>
          ))}
        </div>

        <section className="grid gap-3 sm:grid-cols-2">
          <MoneyCard label="Pending earnings" value={wallet.finance.pendingEarningsKes} />
          <MoneyCard label="Available balance" value={wallet.finance.availableBalanceKes} />
          <MoneyCard label="Current balance" value={wallet.finance.currentBalanceKes} />
          <MoneyCard label="Total paid out" value={wallet.finance.totalPaidOutKes} />
        </section>

        <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="font-black">Payout readiness</h2>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="KYC status" value={wallet.finance.kycStatus.replaceAll("_", " ")} />
            <Info label="M-PESA payout" value={wallet.finance.payoutProfile?.phoneVerified ? "Verified" : "Not verified"} />
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            <KycUploadForm currentStatus={wallet.finance.kycStatus} />

            <div className="space-y-3 rounded-2xl bg-neutral-50 p-4">
              <div>
                <h3 className="font-black">Verify payout M-PESA number</h3>
                <p className="mt-1 text-xs leading-5 text-neutral-500">Request an OTP, then verify it. Changing an existing payout number starts a 24-hour safety hold.</p>
              </div>
              <form action={requestPayoutOtpAction} className="flex gap-2">
                <input type="hidden" name="userId" value={user.userId} />
                <Input name="phoneNumber" placeholder="07XX XXX XXX" required />
                <Button type="submit" variant="outline">Send OTP</Button>
              </form>
              <form action={verifyPayoutPhoneAction} className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
                <input type="hidden" name="userId" value={user.userId} />
                <Input name="phoneNumber" placeholder="Same M-PESA number" required />
                <Input name="code" placeholder="Code" required />
                <Button type="submit">Verify</Button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="font-black">Credit activity</h2>
          <div className="mt-4 divide-y divide-black/5">
            {wallet.creditLedger.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-bold">{entry.entryType.replaceAll("_", " ")} {entry.kind ? `· ${entry.kind.replaceAll("_", " ")}` : ""}</p>
                  <p className="text-xs text-neutral-500">{entry.createdAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                </div>
                <div className="text-right">
                  <p className="font-black tabular-nums">{entry.quantity ? `${entry.quantity > 0 ? "+" : ""}${entry.quantity}` : "—"}</p>
                  <p className="text-xs text-neutral-500">{entry.currency} {Number(entry.value).toFixed(2)}</p>
                </div>
              </div>
            ))}
            {!wallet.creditLedger.length ? <p className="py-6 text-center text-sm text-neutral-500">No credit activity yet.</p> : null}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <HistoryPanel title="Earning lots" empty="No creator earnings yet.">
            {wallet.earningLots.map((lot) => (
              <div key={lot.id} className="rounded-2xl bg-neutral-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{lot.source.replaceAll("_", " ")}</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{lot.status}</span>
                </div>
                <p className="mt-2 font-bold tabular-nums">{lot.currency} {Number(lot.amount).toFixed(2)}</p>
                <p className="mt-1 text-xs text-neutral-500">Available {lot.availableAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                {lot.heldReason ? <p className="mt-2 text-xs text-amber-700">{lot.heldReason}</p> : null}
              </div>
            ))}
          </HistoryPanel>
          <HistoryPanel title="Payouts" empty="No payouts have been created yet.">
            {wallet.payouts.map((payout) => (
              <div key={payout.id} className="rounded-2xl bg-neutral-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black">{payout.currency} {Number(payout.amount).toFixed(2)}</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold">{payout.status}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-500">Created {payout.createdAt.toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                {payout.failureReason ? <p className="mt-2 text-xs text-rose-700">{payout.failureReason}</p> : null}
              </div>
            ))}
          </HistoryPanel>
        </section>
      </div>
    </CustomerShell>
  )
}

function MoneyCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm"><p className="text-sm font-bold text-neutral-500">{label}</p><p className="mt-3 text-3xl font-black tabular-nums">KES {value.toFixed(2)}</p></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-neutral-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-neutral-500">{label}</p><p className="mt-1 font-extrabold">{value}</p></div>
}

function HistoryPanel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <section className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
      <h2 className="font-black">{title}</h2>
      <div className="mt-4 space-y-3">
        {hasChildren ? children : <p className="py-6 text-center text-sm text-neutral-500">{empty}</p>}
      </div>
    </section>
  )
}

async function requestPayoutOtpAction(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  const userId = String(formData.get("userId") || "")
  if (!viewer || viewer.userId !== userId) throw new Error("Sign in required")
  const phone = normalizePhoneNumber(String(formData.get("phoneNumber") || ""))
  if (!phone) throw new Error("Enter a valid M-PESA number")
  await sendOtpNotification({
    recipient: phone,
    channel: VerificationChannel.SMS,
    purpose: VerificationPurpose.PAYOUT_PHONE,
    userId: viewer.userId,
  })
  revalidatePath("/wallet")
}

async function verifyPayoutPhoneAction(formData: FormData) {
  "use server"
  const viewer = await getCurrentCustomerUser()
  const userId = String(formData.get("userId") || "")
  if (!viewer || viewer.userId !== userId) throw new Error("Sign in required")
  const phone = normalizePhoneNumber(String(formData.get("phoneNumber") || ""))
  if (!phone) throw new Error("Enter a valid M-PESA number")
  const verified = await consumeVerificationCode({
    recipient: phone,
    channel: VerificationChannel.SMS,
    purpose: VerificationPurpose.PAYOUT_PHONE,
    code: String(formData.get("code") || ""),
  })
  if (!verified || verified.userId !== viewer.userId) throw new Error("Invalid or expired code")
  const existing = await prisma.payoutProfile.findUnique({ where: { userId: viewer.userId } })
  const changed = Boolean(existing?.mpesaPhone && existing.mpesaPhone !== phone)
  await prisma.payoutProfile.upsert({
    where: { userId: viewer.userId },
    create: { userId: viewer.userId, mpesaPhone: phone, phoneVerifiedAt: new Date(), destinationChangedAt: new Date() },
    update: {
      mpesaPhone: phone,
      phoneVerifiedAt: new Date(),
      ...(changed ? { destinationChangedAt: new Date() } : {}),
      pausedReason: null,
    },
  })
  revalidatePath("/wallet")
}
