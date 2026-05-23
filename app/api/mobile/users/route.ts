import { NextResponse } from "next/server"
import { z } from "zod"
import { findMobileUsersByIds, serializeMobileUser } from "@/lib/mobile-users"

const schema = z.object({
  ids: z.string().optional(),
})

export async function GET(request: Request) {
  const url = new URL(request.url)
  const parsed = schema.safeParse({
    ids: url.searchParams.get("ids") || undefined,
  })

  if (!parsed.success || !parsed.data.ids) {
    return NextResponse.json({ success: false, message: "ids query parameter is required" }, { status: 400 })
  }

  const ids = parsed.data.ids
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  const users = await findMobileUsersByIds(ids)
  return NextResponse.json({
    success: true,
    data: users.map((user) => serializeMobileUser(user)),
  })
}
