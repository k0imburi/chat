import "server-only"

import bcrypt from "bcryptjs"
import { LoginProvider, MediaKind, Prisma, UserRole, type User, type UserMedia } from "@prisma/client"
import { prisma } from "@/lib/prisma"

type UserWithMedia = User & {
  media: UserMedia[]
}

type RegisterMobileUserInput = {
  fullName?: string
  email?: string
  password?: string
  phoneNumber?: string
  gender?: string
  birthday?: string
  username?: string
  bio?: string
  deviceToken?: string
  deviceSystem?: string
  country?: string
  city?: string
  latitude?: number
  longitude?: number
  interests?: string[]
  links?: string[]
  filter?: Record<string, unknown>
  externalId?: string
  loginProvider?: LoginProvider
  profileVideo?: {
    videoUrl: string
    thumbnailUrl: string
  }
}

function fallbackFullName(input: RegisterMobileUserInput) {
  const explicit = input.fullName?.trim()
  if (explicit && explicit.length >= 2) return explicit

  const emailName = input.email?.split("@")[0]?.replace(/[._-]+/g, " ")?.trim()
  if (emailName && emailName.length >= 2) return emailName

  const phoneName = input.phoneNumber?.trim()
  if (phoneName && phoneName.length >= 2) return phoneName

  return "New User"
}

export function mapMobileLoginProvider(provider: LoginProvider) {
  if (provider === LoginProvider.PHONE) return "number"
  return provider.toLowerCase()
}

function mapStatus(status: string) {
  return status.toLowerCase()
}

function toJsonValue(value?: Record<string, unknown> | string[]) {
  return value as Prisma.InputJsonValue | undefined
}

function existingJsonToInput(value: Prisma.JsonValue | null | undefined) {
  if (value === null || value === undefined) return undefined
  return value as Prisma.InputJsonValue
}

function normalizeDate(value?: string | Date | null) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function serializeVideo(media?: UserMedia | null) {
  if (!media) {
    return {
      id: "",
      videoUrl: "",
      thumbnailUrl: "",
      views: 0,
      likes: 0,
      createdAt: null,
      isLiked: false,
    }
  }

  return {
    id: media.id,
    videoUrl: media.url,
    thumbnailUrl: media.thumbnailUrl || media.url,
    views: media.views,
    likes: media.likes,
    createdAt: media.createdAt.toISOString(),
    isLiked: false,
  }
}

export function serializeMobileUser(user: UserWithMedia) {
  const profileVideo = user.media.find((item) => item.kind === MediaKind.PROFILE_VIDEO)
  const gallery = user.media.filter((item) => item.kind === MediaKind.GALLERY_VIDEO).map(serializeVideo)

  return {
    userId: user.id,
    profileAvatarUrl: user.avatarUrl || profileVideo?.thumbnailUrl || "",
    profileVideo: serializeVideo(profileVideo),
    fullname: user.fullName,
    username: user.username || "",
    gender: user.gender,
    birthday: user.birthday?.toISOString() || "",
    gallery,
    interests: Array.isArray(user.interests) ? user.interests : [],
    links: Array.isArray(user.links) ? user.links : [],
    filter:
      user.filter && typeof user.filter === "object"
        ? user.filter
        : {
            minAge: 18,
            maxAge: 100,
            maxDistance: 50,
            hideAge: false,
            hideDistance: false,
            gender: "All",
          },
    location: {
      city: user.city || "",
      country: user.country || "",
      geo: {
        geopoint: {
          latitude: Number(user.latitude ?? 0),
          longitude: Number(user.longitude ?? 0),
        },
      },
    },
    email: user.email || "",
    bio: user.bio || "",
    phoneNumber: user.phoneNumber || "",
    deviceToken: user.deviceToken || "",
    deviceSystem: user.deviceSystem || "",
    swipeCount: user.swipeCount,
    verified: user.verified ? 1 : 0,
    lastSwipeDate: user.lastSwipeDate?.toISOString() || null,
    status: mapStatus(user.status),
    loginProvider: mapMobileLoginProvider(user.loginProvider),
    lastActive: user.lastActiveAt?.toISOString() || null,
    createdAt: user.createdAt.toISOString(),
  }
}

export function serializeMobileUserWithLikes(user: UserWithMedia, likedMediaIds: Set<string>) {
  const serialized = serializeMobileUser(user) as Record<string, unknown>
  const profileVideo = serialized.profileVideo as Record<string, unknown>
  const gallery = (serialized.gallery as Array<Record<string, unknown>>).map((video) => ({
    ...video,
    isLiked: likedMediaIds.has(String(video.id || "")),
  }))

  return {
    ...serialized,
    profileVideo: {
      ...profileVideo,
      isLiked: likedMediaIds.has(String(profileVideo.id || "")),
    },
    gallery,
  }
}

export async function findMobileUserById(userId: string): Promise<UserWithMedia | null> {
  const user = (await prisma.user.findUnique({
    where: { id: userId },
    include: { media: true },
  })) as UserWithMedia | null

  return user
}

export async function findMobileUsersByIds(userIds: string[]) {
  return (await prisma.user.findMany({
    where: {
      id: { in: userIds },
      role: UserRole.USER,
    },
    include: { media: true },
  })) as UserWithMedia[]
}

export async function findMobileUserByEmail(email: string): Promise<UserWithMedia | null> {
  return (await prisma.user.findFirst({
    where: {
      email,
      role: UserRole.USER,
    },
    include: { media: true },
  })) as UserWithMedia | null
}

export async function findMobileUserByPhone(phoneNumber: string): Promise<UserWithMedia | null> {
  return (await prisma.user.findFirst({
    where: {
      phoneNumber,
      role: UserRole.USER,
    },
    include: { media: true },
  })) as UserWithMedia | null
}

export async function verifyMobileUserPassword(user: User, password: string) {
  if (!user.passwordHash) return false
  return bcrypt.compare(password, user.passwordHash)
}

export async function registerMobileUser(input: RegisterMobileUserInput) {
  if (input.email) {
    const existingEmail = await findMobileUserByEmail(input.email)
    if (existingEmail) {
      throw new Error("An account with this email already exists")
    }
  }

  if (input.phoneNumber) {
    const existingPhone = await prisma.user.findFirst({
      where: { phoneNumber: input.phoneNumber, role: UserRole.USER },
    })
    if (existingPhone) {
      throw new Error("An account with this phone number already exists")
    }
  }

  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : null

  const created = (await prisma.user.create({
    data: {
      externalId: input.externalId,
      fullName: fallbackFullName(input),
      username: input.username,
      gender: input.gender || "",
      birthday: normalizeDate(input.birthday),
      email: input.email,
      passwordHash,
      phoneNumber: input.phoneNumber,
      bio: input.bio,
      role: UserRole.USER,
      isActive: true,
      deviceToken: input.deviceToken,
      deviceSystem: input.deviceSystem,
      country: input.country,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      interests: toJsonValue(input.interests),
      links: toJsonValue(input.links),
      filter: toJsonValue(input.filter),
      loginProvider: input.loginProvider || LoginProvider.EMAIL,
      media: input.profileVideo
        ? {
            create: {
              kind: MediaKind.PROFILE_VIDEO,
              url: input.profileVideo.videoUrl,
              thumbnailUrl: input.profileVideo.thumbnailUrl,
            },
          }
        : undefined,
    },
    include: { media: true },
  })) as UserWithMedia

  return created
}

export async function upsertMobileProviderUser(input: RegisterMobileUserInput): Promise<UserWithMedia> {
  if (!input.externalId) {
    throw new Error("externalId is required")
  }

  const provider = input.loginProvider || LoginProvider.EMAIL
  const existing = await prisma.user.findUnique({
    where: { externalId: input.externalId },
    include: { media: true },
  })

  if (existing) {
    return (await prisma.user.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName?.trim() ? input.fullName : existing.fullName,
        username: input.username ?? existing.username,
        email: input.email ?? existing.email,
        phoneNumber: input.phoneNumber ?? existing.phoneNumber,
        bio: input.bio ?? existing.bio,
        deviceToken: input.deviceToken ?? existing.deviceToken,
        deviceSystem: input.deviceSystem ?? existing.deviceSystem,
        country: input.country ?? existing.country,
        city: input.city ?? existing.city,
        latitude: input.latitude ?? existing.latitude,
        longitude: input.longitude ?? existing.longitude,
        interests: input.interests ? toJsonValue(input.interests) : existingJsonToInput(existing.interests),
        links: input.links ? toJsonValue(input.links) : existingJsonToInput(existing.links),
        filter: input.filter ? toJsonValue(input.filter) : existingJsonToInput(existing.filter),
        loginProvider: provider,
        lastActiveAt: new Date(),
      },
      include: { media: true },
    })) as UserWithMedia
  }

  return registerMobileUser({
    ...input,
    loginProvider: provider,
  })
}

export async function updateMobileUserProfile(
  userId: string,
  input: Partial<RegisterMobileUserInput> & {
    avatarUrl?: string
    swipeCount?: number
    lastSwipeDate?: string
    status?: string
  },
): Promise<UserWithMedia> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: { media: true },
  })

  if (!existing || existing.role !== UserRole.USER) {
    throw new Error("User not found")
  }

  return (await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        fullName: input.fullName?.trim() ? input.fullName : undefined,
        username: input.username,
        gender: input.gender,
        birthday: input.birthday !== undefined ? normalizeDate(input.birthday) : undefined,
        email: input.email,
        phoneNumber: input.phoneNumber,
        bio: input.bio,
        avatarUrl: input.avatarUrl,
        swipeCount: input.swipeCount,
        lastSwipeDate: input.lastSwipeDate !== undefined ? normalizeDate(input.lastSwipeDate) : undefined,
        status: input.status as never,
        deviceToken: input.deviceToken,
        deviceSystem: input.deviceSystem,
        country: input.country,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        interests: input.interests ? toJsonValue(input.interests) : undefined,
        links: input.links ? toJsonValue(input.links) : undefined,
        filter: input.filter ? toJsonValue(input.filter) : undefined,
        lastActiveAt: new Date(),
      },
      include: { media: true },
    })

    if (input.profileVideo) {
      const currentProfileVideo = existing.media.find((item) => item.kind === MediaKind.PROFILE_VIDEO)

      if (currentProfileVideo) {
        await tx.userMedia.update({
          where: { id: currentProfileVideo.id },
          data: {
            url: input.profileVideo.videoUrl,
            thumbnailUrl: input.profileVideo.thumbnailUrl,
          },
        })
      } else {
        await tx.userMedia.create({
          data: {
            userId,
            kind: MediaKind.PROFILE_VIDEO,
            url: input.profileVideo.videoUrl,
            thumbnailUrl: input.profileVideo.thumbnailUrl,
          },
        })
      }
    }

    return (await tx.user.findUnique({
      where: { id: updated.id },
      include: { media: true },
    })) as UserWithMedia
  })) as UserWithMedia
}
