import { verifyPaystackAdReference } from '@/lib/ad-checkout'

export default async function AdCheckoutReturn({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>
}) {
  const { reference } = await searchParams
  let confirmed = false
  if (reference) {
    try {
      confirmed = await verifyPaystackAdReference(reference)
    } catch {
      confirmed = false
    }
  }

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-semibold">Promotion checkout</h1>
      <p className="mt-4">
        {confirmed
          ? 'Payment confirmed. Your campaign balance has been updated. Return to Ads Center and refresh your campaign.'
          : 'Your payment is being confirmed. Return to Ads Center and refresh your campaign in a moment.'}
      </p>
    </main>
  )
}
