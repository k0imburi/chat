import { NextResponse } from "next/server"
import { LoginProvider } from "@prisma/client"
import { z } from "zod"
import { signMobileSessionToken } from "@/lib/mobile-session"
import { verifyMobileProviderToken } from "@/lib/mobile-provider-auth"
import { mapMobileLoginProvider, serializeMobileUser, upsertMobileProviderUser } from "@/lib/mobile-users"

const schema = z.object({
  idToken: z.string().min(1),
  fullName: z.string().min(2).optional(),
  deviceToken: z.string().optional(),
  deviceSystem: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  interests: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  loginProvider: z.union([z.literal(LoginProvider.GOOGLE), z.literal(LoginProvider.APPLE)]),
  profileVideo: z
    .object({
      videoUrl: z.string().url(),
      thumbnailUrl: z.string().url(),
    })
    .optional(),
})

export async function POST(request: Request) {
  try {
    const parsed = schema.parse(await request.json())
    const verified = await verifyMobileProviderToken({
      provider: parsed.loginProvider,
      idToken: parsed.idToken,
    })

    const user = await upsertMobileProviderUser({
      provider: verified.provider,
      providerUserId: verified.providerUserId,
      verifiedEmail: verified.emailVerified ? verified.email : undefined,
      email: verified.email,
      fullName: parsed.fullName,
      deviceToken: parsed.deviceToken,
      deviceSystem: parsed.deviceSystem,
      country: parsed.country,
      city: parsed.city,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      interests: parsed.interests,
      links: parsed.links,
      filter: parsed.filter,
      profileVideo: parsed.profileVideo,
    })

    const token = await signMobileSessionToken({
      userId: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber,
      loginProvider: mapMobileLoginProvider(user.loginProvider),
    })

    return NextResponse.json({
      success: true,
      token,
      user: serializeMobileUser(user),
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, message: error.issues[0]?.message ?? "Invalid request" }, { status: 400 })
    }

    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Failed to sign in with provider" },
      { status: 500 },
    )
  }
}
