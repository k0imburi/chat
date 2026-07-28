import { Prisma } from "@prisma/client"

export const roundUsd = (value: Prisma.Decimal | string | number) =>
  new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

export function calculateWithdrawalValues(
  grossUsdInput: Prisma.Decimal | string | number,
  feePercentInput: Prisma.Decimal | string | number,
  rateInput: Prisma.Decimal | string | number,
) {
  const grossUsd = roundUsd(grossUsdInput)
  const feePercent = roundUsd(feePercentInput)
  const rate = roundUsd(rateInput)
  const feeUsd = roundUsd(grossUsd.mul(feePercent).div(100))
  const netUsd = roundUsd(grossUsd.minus(feeUsd))
  const grossKes = roundUsd(grossUsd.mul(rate))
  const netKes = netUsd.mul(rate).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
  const minimumShortfallUsd = Prisma.Decimal.max(0, new Prisma.Decimal(40).minus(netUsd))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
  return { grossUsd, feePercent, rate, feeUsd, netUsd, grossKes, netKes, minimumShortfallUsd }
}
