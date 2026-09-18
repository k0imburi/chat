import Image from "next/image";
import Link from "next/link";
import { AccountType } from "@prisma/client";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Globe2,
  Mail,
  MapPin,
  Phone,
  XCircle,
} from "lucide-react";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { reviewEntityDocumentsAction } from "@/lib/actions/entities";
import { updateUserStatusAction } from "@/lib/actions/users";
import { formatDateTime, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const statusClass: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-800",
  REJECTED: "bg-rose-50 text-rose-700",
  NOT_SUBMITTED: "bg-muted text-muted-foreground",
};

export default async function EntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entity = await prisma.user.findFirst({
    where: { id, accountType: AccountType.ENTITY },
    include: { media: { orderBy: { createdAt: "desc" } } },
  });
  if (!entity) notFound();

  const documents = documentEntries(entity.entityDocuments);
  const initials = entity.fullName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const profileMedia = entity.media.find(
    (item) => item.kind === "PROFILE_VIDEO",
  );
  const profileImage =
    entity.avatarUrl || profileMedia?.thumbnailUrl || profileMedia?.url;
  const isApproved = entity.entityVerification === "APPROVED";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/entities">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to entities
          </Link>
        </Button>
        <div className="flex overflow-hidden rounded-lg border border-border">
          {(["ACTIVE", "BLOCKED", "REPORTED", "HIDDEN"] as const).map(
            (status) => (
              <ActionForm key={status} action={updateUserStatusAction}>
                <input type="hidden" name="userId" value={entity.id} />
                <input type="hidden" name="status" value={status} />
                <Button
                  type="submit"
                  size="sm"
                  variant={entity.status === status ? "default" : "ghost"}
                  className="rounded-none border-0 border-r border-border last:border-r-0"
                >
                  {status.charAt(0) + status.slice(1).toLowerCase()}
                </Button>
              </ActionForm>
            ),
          )}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[21rem_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Card className="overflow-hidden">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-4 h-24 w-24 overflow-hidden rounded-lg bg-muted">
                  {profileImage ? (
                    <Image
                      src={profileImage}
                      alt={entity.fullName}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-2xl font-semibold text-muted-foreground">
                      {initials}
                    </span>
                  )}
                </div>
                <h1 className="text-xl font-semibold">{entity.fullName}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  @{entity.username || "unassigned"}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <StatusBadge value={entity.status} />
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass[entity.entityVerification]}`}
                  >
                    {entity.entityVerification.replaceAll("_", " ")}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entity details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail
                icon={Mail}
                label="Official email"
                value={entity.officialEmail || entity.email || "Not provided"}
              />
              <Detail
                icon={Phone}
                label="Official phone"
                value={
                  entity.officialPhoneNumber ||
                  entity.phoneNumber ||
                  "Not provided"
                }
              />
              <Detail
                icon={Globe2}
                label="Website"
                value={entity.websiteUrl || "Not provided"}
                href={entity.websiteUrl}
              />
              <Detail
                icon={MapPin}
                label="Registered address"
                value={
                  [entity.physicalAddress, entity.city, entity.country]
                    .filter(Boolean)
                    .join(", ") || "Not provided"
                }
              />
              <Detail
                icon={CalendarDays}
                label="Joined"
                value={formatDateTime(entity.createdAt)}
              />
              <Detail
                icon={CalendarDays}
                label="Last active"
                value={formatRelative(entity.lastActiveAt ?? entity.createdAt)}
              />
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Verification review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Fact
                  label="Verification"
                  value={entity.entityVerification.replaceAll("_", " ")}
                />
                <Fact
                  label="Published in app"
                  value={
                    entity.entityPublishedAt
                      ? formatDateTime(entity.entityPublishedAt)
                      : "Not published"
                  }
                />
                <Fact
                  label="Verification badge"
                  value={isApproved && entity.verified ? "Active" : "Inactive"}
                />
              </div>
              {documents.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {documents.map((document) => (
                    <a
                      key={document.objectKey}
                      href={`/api/admin/private-file?key=${encodeURIComponent(document.objectKey)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/50"
                    >
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-medium">{document.label}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  No verification documents have been submitted.
                </p>
              )}
              {documents.length > 0 && !isApproved ? (
                <div className="flex flex-wrap gap-2">
                  <ReviewButton userId={entity.id} decision="APPROVE" />
                  <ReviewButton userId={entity.id} decision="REJECT" />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account plan</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Fact
                label="Plan"
                value={
                  entity.entityPlanType
                    ? entity.entityPlanType.toLowerCase()
                    : "No active plan"
                }
              />
              <Fact
                label="Started"
                value={
                  entity.entityPlanStartedAt
                    ? formatDateTime(entity.entityPlanStartedAt)
                    : "—"
                }
              />
              <Fact
                label="Expires"
                value={
                  entity.entityPlanExpiresAt
                    ? formatDateTime(entity.entityPlanExpiresAt)
                    : "—"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile content</CardTitle>
            </CardHeader>
            <CardContent>
              {entity.media.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {entity.media.map((item) => (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-lg border"
                    >
                      <div className="relative aspect-video bg-muted">
                        {item.thumbnailUrl || item.url ? (
                          <Image
                            src={item.thumbnailUrl || item.url}
                            alt={item.title || entity.fullName}
                            fill
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <p className="truncate px-3 py-2 text-sm font-medium">
                        {item.title || "Profile media"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No media uploaded.
                </p>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}

function ReviewButton({
  userId,
  decision,
}: {
  userId: string;
  decision: "APPROVE" | "REJECT";
}) {
  return (
    <ActionForm action={reviewEntityDocumentsAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="decision" value={decision} />
      {decision === "APPROVE" ? (
        <select
          name="badgeColor"
          defaultValue="blue"
          aria-label="Verification badge color"
          className="mb-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          <option value="blue">Blue #9FE7E5 badge</option>
          <option value="gold">Gold badge</option>
        </select>
      ) : null}
      <Button
        type="submit"
        variant={decision === "APPROVE" ? "default" : "outline"}
      >
        {decision === "APPROVE" ? (
          <CheckCircle2 className="mr-2 h-4 w-4" />
        ) : (
          <XCircle className="mr-2 h-4 w-4" />
        )}
        {decision === "APPROVE" ? "Approve documents" : "Reject documents"}
      </Button>
    </ActionForm>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  href?: string | null;
}) {
  const content = href ? (
    <a
      className="break-all text-primary hover:underline"
      href={href.startsWith("http") ? href : `https://${href}`}
      target="_blank"
      rel="noreferrer"
    >
      {value}
    </a>
  ) : (
    <span className="break-words">{value}</span>
  );
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="font-medium">{content}</div>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium capitalize">{value}</p>
    </div>
  );
}

function documentEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const labels: Record<string, string> = {
    representativeId: "Representative ID",
    registration: "Registration",
    supporting: "Supporting document",
  };
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string" && item.trim())
    .map(([key, item]) => ({
      label: labels[key] || key,
      objectKey: String(item),
    }));
}
