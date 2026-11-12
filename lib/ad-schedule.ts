type Schedule = { startDate: Date | null; endDate: Date | null; publishedAt: Date | null };

export function startAdSchedule(ad: Schedule, now = new Date()) {
  if (ad.publishedAt) return {};
  const duration = Math.max(86400000, (ad.endDate?.getTime() ?? 0) - (ad.startDate?.getTime() ?? 0));
  const startDate = new Date(Math.max(now.getTime(), ad.startDate?.getTime() ?? 0));
  return { publishedAt: now, startDate, endDate: new Date(startDate.getTime() + duration) };
}
