import "server-only"

import bcrypt from "bcryptjs"
import { LoginProvider, MediaKind, Prisma, UserRole, UserStatus, type User, type UserMedia } from "@prisma/client"
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
      imageUrl: "",
      images: [],
      thumbnailUrl: "",
      title: "",
      titlePositionX: 0.5,
      titlePositionY: 0.5,
      caption: "",
      description: "",
      views: 0,
      likes: 0,
      commentCount: 0,
      createdAt: null,
      isLiked: false,
    }
  }

  const isImage = media.kind === MediaKind.IMAGE
  const images = Array.isArray(media.images) ? (media.images as string[]) : []

  return {
    id: media.id,
    videoUrl: isImage ? "" : media.url,
    imageUrl: isImage ? media.url : "",
    images,
    thumbnailUrl: media.thumbnailUrl || media.url,
    title: media.title || "",
    titlePositionX: media.titlePositionX ?? 0.5,
    titlePositionY: media.titlePositionY ?? 0.5,
    caption: media.caption || "",
    description: media.description || "",
    views: media.views,
    likes: media.likes,
    commentCount: media.commentCount,
    createdAt: media.createdAt.toISOString(),
    isLiked: false,
  }
}

export function serializeMobileUser(user: UserWithMedia) {
  const profileVideo = user.media.find((item) => item.kind === MediaKind.PROFILE_VIDEO)
  const gallery = user.media
    .filter((item) => item.kind === MediaKind.GALLERY_VIDEO || item.kind === MediaKind.IMAGE)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(serializeVideo)

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
    // Official/broadcast account (the system ChatAndTip sender) — the app
    // renders its verified check in gold rather than blue.
    isBroadcaster: user.externalId === "system:chatandtip",
    lastSwipeDate: user.lastSwipeDate?.toISOString() || null,
    status: mapStatus(user.status),
    loginProvider: mapMobileLoginProvider(user.loginProvider),
    lastActive: user.lastActiveAt?.toISOString() || null,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function serializeMobileUserWithCounts(user: UserWithMedia) {
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followedId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ])
  return { ...serializeMobileUser(user), followersCount, followingCount }
}

export function serializeMobileUserWithLikes(
  user: UserWithMedia,
  likedMediaIds: Set<string>,
  savedMediaIds: Set<string> = new Set(),
) {
  const serialized = serializeMobileUser(user) as Record<string, unknown>
  const profileVideo = serialized.profileVideo as Record<string, unknown>
  const gallery = (serialized.gallery as Array<Record<string, unknown>>).map((video) => ({
    ...video,
    isLiked: likedMediaIds.has(String(video.id || "")),
    isSaved: savedMediaIds.has(String(video.id || "")),
  }))

  return {
    ...serialized,
    profileVideo: {
      ...profileVideo,
      isLiked: likedMediaIds.has(String(profileVideo.id || "")),
      isSaved: savedMediaIds.has(String(profileVideo.id || "")),
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

export function assertMobileUserCanAuthenticate(user: User) {
  if (user.role !== UserRole.USER) {
    throw new Error("Mobile access is restricted to user accounts")
  }

  if (!user.isActive || user.status === UserStatus.BLOCKED || user.status === UserStatus.HIDDEN) {
    throw new Error("This account is not allowed to sign in")
  }
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

export async function upsertMobileProviderUser(
  input: RegisterMobileUserInput & {
    provider: LoginProvider
    providerUserId: string
    verifiedEmail?: string
  },
): Promise<UserWithMedia> {
  const provider = input.provider
  const providerUserId = input.providerUserId.trim()
  if (!providerUserId) {
    throw new Error("providerUserId is required")
  }

  const existingAccount = await prisma.providerAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider,
        providerUserId,
      },
    },
    include: {
      user: {
        include: { media: true },
      },
    },
  })

  if (existingAccount) {
    assertMobileUserCanAuthenticate(existingAccount.user)

    return (await prisma.user.update({
      where: { id: existingAccount.userId },
      data: {
        fullName: input.fullName?.trim() ? input.fullName : existingAccount.user.fullName,
        username: input.username ?? existingAccount.user.username,
        email: input.verifiedEmail ?? input.email ?? existingAccount.user.email,
        phoneNumber: input.phoneNumber ?? existingAccount.user.phoneNumber,
        bio: input.bio ?? existingAccount.user.bio,
        deviceToken: input.deviceToken ?? existingAccount.user.deviceToken,
        deviceSystem: input.deviceSystem ?? existingAccount.user.deviceSystem,
        country: input.country ?? existingAccount.user.country,
        city: input.city ?? existingAccount.user.city,
        latitude: input.latitude ?? existingAccount.user.latitude,
        longitude: input.longitude ?? existingAccount.user.longitude,
        interests: input.interests ? toJsonValue(input.interests) : existingJsonToInput(existingAccount.user.interests),
        links: input.links ? toJsonValue(input.links) : existingJsonToInput(existingAccount.user.links),
        filter: input.filter ? toJsonValue(input.filter) : existingJsonToInput(existingAccount.user.filter),
        loginProvider: provider,
        lastActiveAt: new Date(),
        lastLoginAt: new Date(),
      },
      include: { media: true },
    })) as UserWithMedia
  }

  const normalizedEmail = input.verifiedEmail ?? input.email
  let linkedUser: UserWithMedia | null = null

  if (provider === LoginProvider.PHONE && input.phoneNumber) {
    linkedUser = await findMobileUserByPhone(input.phoneNumber)
  } else if (normalizedEmail) {
    linkedUser = await findMobileUserByEmail(normalizedEmail)
  }

  if (linkedUser) {
    assertMobileUserCanAuthenticate(linkedUser)

    return (await prisma.$transaction(async (tx) => {
      await tx.providerAccount.create({
        data: {
          userId: linkedUser!.id,
          provider,
          providerUserId,
          email: normalizedEmail,
        },
      })

      const updated = await tx.user.update({
        where: { id: linkedUser!.id },
        data: {
          fullName: input.fullName?.trim() ? input.fullName : linkedUser!.fullName,
          username: input.username ?? linkedUser!.username,
          email: normalizedEmail ?? linkedUser!.email,
          phoneNumber: input.phoneNumber ?? linkedUser!.phoneNumber,
          bio: input.bio ?? linkedUser!.bio,
          deviceToken: input.deviceToken ?? linkedUser!.deviceToken,
          deviceSystem: input.deviceSystem ?? linkedUser!.deviceSystem,
          country: input.country ?? linkedUser!.country,
          city: input.city ?? linkedUser!.city,
          latitude: input.latitude ?? linkedUser!.latitude,
          longitude: input.longitude ?? linkedUser!.longitude,
          interests: input.interests ? toJsonValue(input.interests) : undefined,
          links: input.links ? toJsonValue(input.links) : undefined,
          filter: input.filter ? toJsonValue(input.filter) : undefined,
          loginProvider: provider,
          lastActiveAt: new Date(),
          lastLoginAt: new Date(),
        },
        include: { media: true },
      })

      return updated as UserWithMedia
    })) as UserWithMedia
  }

  return (await prisma.$transaction(async (tx) => {
    const created = (await tx.user.create({
      data: {
        fullName: fallbackFullName({
          ...input,
          email: normalizedEmail,
        }),
        username: input.username,
        gender: input.gender || "",
        birthday: normalizeDate(input.birthday),
        email: normalizedEmail,
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
        loginProvider: provider,
        lastActiveAt: new Date(),
        lastLoginAt: new Date(),
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

    await tx.providerAccount.create({
      data: {
        userId: created.id,
        provider,
        providerUserId,
        email: normalizedEmail,
      },
    })

    return created
  })) as UserWithMedia
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
