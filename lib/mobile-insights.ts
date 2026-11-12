import "server-only";
import { prisma } from "@/lib/prisma";
import { financeSummary } from "@/lib/mobile-finance";
import {accountPerformance} from '@/lib/account-performance';

export function percentChange(current: number, previous: number) {
  return previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function accountInsights(userId: string, days: number, now = new Date()) {
  if (![7, 30, 90].includes(days)) throw new Error("Invalid period");
  const start = new Date(now.getTime() - days * 86400000);
  const previousStart = new Date(start.getTime() - days * 86400000);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountType: true } });
  const entity = user.accountType === "ENTITY";
  const [wallet, followers, newFollowers, previousFollowers, posts, postTotals, audience, reach, campaigns] = await Promise.all([
    entity ? null : financeSummary(userId),
    prisma.follow.count({ where: { followedId: userId } }),
    prisma.follow.count({ where: { followedId: userId, createdAt: { gte: start, lt: now } } }),
    prisma.follow.count({ where: { followedId: userId, createdAt: { gte: previousStart, lt: start } } }),
    prisma.userMedia.findMany({ where: { userId, kind: { in: ["IMAGE", "GALLERY_VIDEO"] } },
      orderBy: [{ views: "desc" }, { createdAt: "desc" }], take: 20,
      select: { id: true, title: true, caption: true, kind: true, thumbnailUrl: true, url: true,
        views: true, likes: true, commentCount: true, shareCount: true, saveCount: true, createdAt: true } }),
    prisma.userMedia.aggregate({ where: { userId, kind: { in: ["IMAGE", "GALLERY_VIDEO"] } },
      _count: true, _sum: { views: true, likes: true, commentCount: true, shareCount: true } }),
    // Only aggregate cohorts of at least ten distinct viewers leave the server.
    prisma.$queryRaw<Array<{ country: string; viewers: bigint }>>`
      SELECT u.country, COUNT(DISTINCT s.userId) AS viewers
      FROM DiscoverSeen s JOIN UserMedia m ON m.id=s.mediaId JOIN users u ON u.id=s.userId
      WHERE m.userId=${userId} AND s.userId<>${userId} AND s.seenAt>=${start} AND s.seenAt<${now}
        AND u.country IS NOT NULL AND u.country<>''
      GROUP BY u.country HAVING COUNT(DISTINCT s.userId)>=10 ORDER BY viewers DESC LIMIT 20`,
    prisma.$queryRaw<Array<{ viewers: bigint }>>`
      SELECT COUNT(DISTINCT s.userId) AS viewers FROM DiscoverSeen s JOIN UserMedia m ON m.id=s.mediaId
      WHERE m.userId=${userId} AND s.userId<>${userId} AND s.seenAt>=${start} AND s.seenAt<${now}`,
    prisma.adCampaign.findMany({ where: { ownerId: userId, isTest: false }, orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, metric: true, rate: true,
        impressions: true, clicks: true, likes: true, comments: true, shares: true, spentMicros:true } }),
  ]);
  const rate = wallet?.usdToKesRate ?? 0;
  if (!entity && rate <= 0) throw new Error("Earnings exchange rate is unavailable");
  const lots = entity ? [] : await prisma.$queryRaw<Array<{ day: string; source: string; total: unknown; count: bigint }>>`
    SELECT DATE_FORMAT(settledAt,'%Y-%m-%d') AS day, source,
      SUM(CASE WHEN currency='USD' THEN amount ELSE amount/${rate} END) AS total, COUNT(*) AS count
    FROM EarningLot WHERE userId=${userId} AND status<>'REVERSED'
      AND settledAt>=${start} AND settledAt<${now} GROUP BY day, source ORDER BY day`;
  // Period sums use exact timestamp boundaries, not rounded chart dates.
  const periodLots = entity ? [] : await prisma.earningLot.groupBy({ by: ["source", "currency"],
    where: { userId, status: { not: "REVERSED" }, settledAt: { gte: start, lt: now } }, _sum: { amount: true }, _count: true });
  const previousLots = entity ? [] : await prisma.earningLot.groupBy({ by: ["currency"],
    where: { userId, status: { not: "REVERSED" }, settledAt: { gte: previousStart, lt: start } }, _sum: { amount: true } });
  const usd = (amount: unknown, currency: string) => Number(amount ?? 0) / (currency === "USD" ? 1 : rate);
  const earned = periodLots.reduce((sum, lot) => sum + usd(lot._sum.amount, lot.currency), 0);
  const before = previousLots.reduce((sum, lot) => sum + usd(lot._sum.amount, lot.currency), 0);
  const bySource: Record<string, number> = {};
  for (const lot of periodLots) bySource[lot.source] = (bySource[lot.source] ?? 0) + usd(lot._sum.amount, lot.currency);
  const startDay = start.toISOString().slice(0, 10);
  const daily = new Map<string, number>();
  for (let date = new Date(startDay); date <= now; date = new Date(date.getTime() + 86400000)) daily.set(date.toISOString().slice(0, 10), 0);
  for (const lot of lots) if (daily.has(lot.day)) daily.set(lot.day, (daily.get(lot.day) ?? 0) + Number(lot.total));
  const ads = campaigns.map((ad) => {
    const engagements = ad.likes + ad.comments + ad.shares;
    return { ...ad, spentMicros:undefined, rate: Number(ad.rate), engagements, estimatedSpend: Number(ad.spentMicros??0n)/1e6,
      ctr: ad.impressions ? ad.clicks / ad.impressions * 100 : 0 };
  });
  const insights: string[] = [];
  const viewing = await prisma.analyticsView.aggregate({
    where: {media:{userId},createdAt:{gte:start,lt:now}},
    _count:true, _sum:{watchMs:true},
  });
  const completedViews = await prisma.analyticsView.count({where:{media:{userId},
    createdAt:{gte:start,lt:now},durationMs:{gt:0},completed:true}});
  const videoViews = await prisma.analyticsView.count({where:{media:{userId},
    createdAt:{gte:start,lt:now},durationMs:{gt:0}}});
  const viewsByDay = await prisma.$queryRaw<Array<{day:string;sessions:bigint;watchMs:unknown}>>`
    SELECT DATE_FORMAT(v.createdAt,'%Y-%m-%d') AS day, COUNT(*) AS sessions, SUM(v.watchMs) AS watchMs
    FROM AnalyticsView v JOIN UserMedia m ON m.id=v.mediaId
    WHERE m.userId=${userId} AND v.createdAt>=${start} AND v.createdAt<${now}
    GROUP BY day ORDER BY day`;
  const contentViewing = await prisma.analyticsView.groupBy({by:['mediaId'],
    where:{media:{userId},createdAt:{gte:start,lt:now}},_count:true,_sum:{watchMs:true}});
  if (newFollowers > previousFollowers) insights.push(`New followers increased from ${previousFollowers} to ${newFollowers} compared with the previous ${days} days.`);
  if (earned > before && before > 0) insights.push(`Earnings increased ${percentChange(earned, before)}% compared with the previous ${days} days.`);
  const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0];
  if (topSource) insights.push(`${topSource[0].replaceAll("_", " ").toLowerCase()} is your largest earnings source this period.`);
  return {
    performance:await accountPerformance(userId,start,now),
    entity, period: { start: start.toISOString(), end: now.toISOString(), days, timezone: "UTC" },
    lastUpdatedAt: now.toISOString(), currency: "USD",
    summary: { earned, earningsChange: percentChange(earned, before), followers, newFollowers,
      followersChange: percentChange(newFollowers, previousFollowers), reachedAccounts: Number(reach[0]?.viewers ?? 0),
      tips: periodLots.filter((lot) => lot.source === "TIP").reduce((n, lot) => n + lot._count, 0) },
    daily: [...daily].map(([date, value]) => ({ date, value })), insights,
    viewing: {sessions:viewing._count, watchSeconds:Number(viewing._sum.watchMs??0)/1000,
      averageWatchSeconds:videoViews ? Number(viewing._sum.watchMs??0)/1000/videoViews : 0,
      completionRate:videoViews ? completedViews/videoViews*100 : null,
      daily:viewsByDay.map(row=>({date:row.day,sessions:Number(row.sessions),watchSeconds:Number(row.watchMs)/1000})),
      content:contentViewing.map(row=>({mediaId:row.mediaId,sessions:row._count,watchSeconds:Number(row._sum.watchMs??0)/1000}))},
    content: posts.map((post) => ({ ...post, thumbnailUrl: post.thumbnailUrl || (post.kind === "IMAGE" ? post.url : ""), url: undefined })),
    contentTotals: { posts: postTotals._count, ...postTotals._sum },
    audience: audience.map((row) => ({ country: row.country, viewers: Number(row.viewers) })),
    earnings: wallet ? { available: wallet.withdrawableKes / rate, pending: wallet.pendingEarningsKes / rate,
      paidOut: wallet.totalPaidOutKes / rate, bySource } : null,
    campaigns: ads,
  };
}
