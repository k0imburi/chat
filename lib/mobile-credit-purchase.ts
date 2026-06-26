import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { initiateStkPush } from "@/lib/mpesa"
import { priceCart, type CartItems } from "@/lib/mobile-credits"

/**
 * Start a credit purchase: validate the cart, initiate an MPESA STK push for
 * the total, and record a CreditPurchase linked to the checkout id. Credits
 * are NOT allocated here — only after the STK callback confirms payment (see
 * finalizeCreditPurchaseByCheckoutId in lib/mobile-credits).
 */
export async function initiateCreditPurchase(input: {
  userId: string
  phone: string
  items: CartItems
}) {
  const { totalKes, normalized } = priceCart(input.items)

  const stk = await initiateStkPush({
    phone: input.phone,
    amount: totalKes,
    reference: "ChatAndTip Credits",
    description: "Credit purchase",
    userId: input.userId,
  })

  const purchase = await prisma.creditPurchase.create({
    data: {
      userId: input.userId,
      checkoutRequestId: stk.checkoutRequestID || null,
      phone: input.phone,
      items: normalized as Prisma.InputJsonValue,
      totalKes: new Prisma.Decimal(totalKes),
      status: stk.success ? "PENDING" : "FAILED",
    },
  })

  return {
    success: stk.success,
    message: stk.message,
    purchaseId: purchase.id,
    checkoutRequestId: stk.checkoutRequestID || "",
    totalKes,
  }
}
