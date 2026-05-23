import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActionForm } from "@/components/action-form"
import { PageHeader } from "@/components/page-header"
import { AdminTable } from "@/components/admin-table"
import { SubmitButton } from "@/components/submit-button"
import { saveGeneralSettingsAction, saveNotificationSettingsAction, saveR2SettingsAction } from "@/lib/actions/settings"
import { SETTINGS_TABS } from "@/lib/constants"
import { getSettingsBundle } from "@/lib/queries"

export default async function SettingsPage() {
  const { settings, adminUsers } = await getSettingsBundle()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Platform settings"
        description="Manage application preferences, billing configuration, storage credentials, and administrator access."
      />

      <Tabs defaultValue="general" className="gap-6">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-muted/60 p-1">
          {SETTINGS_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="min-w-fit rounded-lg px-4 py-2">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveGeneralSettingsAction} className="grid gap-4 md:grid-cols-2">
                <Field label="App name" name="appName" defaultValue={settings?.appName} />
                <Field label="Contact email" name="contactEmail" defaultValue={settings?.contactEmail ?? ""} />
                <Field label="Contact phone" name="contactPhone" defaultValue={settings?.contactPhone ?? ""} />
                <Field label="Address" name="address" defaultValue={settings?.address ?? ""} />
                <Field label="Currency" name="currency" defaultValue={settings?.currency ?? "USD"} />
                <Field label="JWT expiry" name="jwtExpiry" defaultValue={settings?.jwtExpiry ?? "7d"} />
                <Field label="Free swipe limit" name="freeMemberSwipeLimit" type="number" defaultValue={String(settings?.freeMemberSwipeLimit ?? 20)} />
                <Field label="Ad after swipes" name="showDiscoverAdAfterSwipes" type="number" defaultValue={String(settings?.showDiscoverAdAfterSwipes ?? 5)} />
                <Field label="Max videos upload" name="maxVideosUpload" type="number" defaultValue={String(settings?.maxVideosUpload ?? 10)} />
                <input type="hidden" name="minimumTip" value={settings?.minimumTip.toString() ?? "0"} />
                <input type="hidden" name="transactionFeePercent" value={settings?.transactionFeePercent.toString() ?? "0"} />
                <input type="hidden" name="usdToKesRate" value={settings?.usdToKesRate.toString() ?? "0"} />
                <input type="hidden" name="mpesaConsumerKey" value={settings?.mpesaConsumerKey ?? ""} />
                <input type="hidden" name="mpesaConsumerSecret" value={settings?.mpesaConsumerSecret ?? ""} />
                <input type="hidden" name="mpesaPasskey" value={settings?.mpesaPasskey ?? ""} />
                <input type="hidden" name="mpesaShortcode" value={settings?.mpesaShortcode ?? ""} />
                <input type="hidden" name="mpesaStoreNumber" value={settings?.mpesaStoreNumber ?? ""} />
                <input type="hidden" name="mpesaShortcodeType" value={settings?.mpesaShortcodeType ?? "CustomerPayBillOnline"} />
                <input type="hidden" name="mpesaEnvironment" value={settings?.mpesaEnvironment ?? "sandbox"} />
                <input type="hidden" name="paypalClientId" value={settings?.paypalClientId ?? ""} />
                <input type="hidden" name="paypalClientSecret" value={settings?.paypalClientSecret ?? ""} />
                <input type="hidden" name="allowVideoModeration" value={String(settings?.allowVideoModeration ?? false)} />
                <input type="hidden" name="showAds" value={String(settings?.showAds ?? false)} />
                <input type="hidden" name="allowFreeAccess" value={String(settings?.allowFreeAccess ?? false)} />
                <input type="hidden" name="allowVideoCall" value={String(settings?.allowVideoCall ?? true)} />
                <input type="hidden" name="allowVoiceCall" value={String(settings?.allowVoiceCall ?? true)} />
                <input type="hidden" name="allowSendImages" value={String(settings?.allowSendImages ?? true)} />

                <div className="md:col-span-2">
                  <SubmitButton type="submit">Save general settings</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Feature controls</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveGeneralSettingsAction} className="space-y-5">
                <input type="hidden" name="appName" defaultValue={settings?.appName} />
                <input type="hidden" name="contactEmail" defaultValue={settings?.contactEmail ?? ""} />
                <input type="hidden" name="contactPhone" defaultValue={settings?.contactPhone ?? ""} />
                <input type="hidden" name="address" defaultValue={settings?.address ?? ""} />
                <input type="hidden" name="currency" defaultValue={settings?.currency ?? "USD"} />
                <input type="hidden" name="jwtExpiry" defaultValue={settings?.jwtExpiry ?? "7d"} />
                <input type="hidden" name="minimumTip" defaultValue={settings?.minimumTip.toString() ?? "0"} />
                <input type="hidden" name="transactionFeePercent" defaultValue={settings?.transactionFeePercent.toString() ?? "0"} />
                <input type="hidden" name="usdToKesRate" defaultValue={settings?.usdToKesRate.toString() ?? "0"} />
                <input type="hidden" name="freeMemberSwipeLimit" defaultValue={String(settings?.freeMemberSwipeLimit ?? 20)} />
                <input type="hidden" name="showDiscoverAdAfterSwipes" defaultValue={String(settings?.showDiscoverAdAfterSwipes ?? 5)} />
                <input type="hidden" name="maxVideosUpload" defaultValue={String(settings?.maxVideosUpload ?? 10)} />
                <input type="hidden" name="mpesaConsumerKey" defaultValue={settings?.mpesaConsumerKey ?? ""} />
                <input type="hidden" name="mpesaConsumerSecret" defaultValue={settings?.mpesaConsumerSecret ?? ""} />
                <input type="hidden" name="mpesaPasskey" defaultValue={settings?.mpesaPasskey ?? ""} />
                <input type="hidden" name="mpesaShortcode" defaultValue={settings?.mpesaShortcode ?? ""} />
                <input type="hidden" name="mpesaStoreNumber" defaultValue={settings?.mpesaStoreNumber ?? ""} />
                <input type="hidden" name="mpesaShortcodeType" defaultValue={settings?.mpesaShortcodeType ?? "CustomerPayBillOnline"} />
                <input type="hidden" name="mpesaEnvironment" defaultValue={settings?.mpesaEnvironment ?? "sandbox"} />
                <input type="hidden" name="paypalClientId" defaultValue={settings?.paypalClientId ?? ""} />
                <input type="hidden" name="paypalClientSecret" defaultValue={settings?.paypalClientSecret ?? ""} />

                <div className="grid gap-3 md:grid-cols-3">
                  <CheckboxField label="Allow video moderation" name="allowVideoModeration" checked={settings?.allowVideoModeration ?? false} />
                  <CheckboxField label="Show ads" name="showAds" checked={settings?.showAds ?? false} />
                  <CheckboxField label="Allow free access" name="allowFreeAccess" checked={settings?.allowFreeAccess ?? false} />
                  <CheckboxField label="Allow video calls" name="allowVideoCall" checked={settings?.allowVideoCall ?? true} />
                  <CheckboxField label="Allow voice calls" name="allowVoiceCall" checked={settings?.allowVoiceCall ?? true} />
                  <CheckboxField label="Allow send images" name="allowSendImages" checked={settings?.allowSendImages ?? true} />
                </div>

                <SubmitButton type="submit">Save feature controls</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <ActionForm action={saveGeneralSettingsAction} className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              {/* Left column: Billing + PayPal */}
              <div className="space-y-6">
                <Card className="rounded-lg">
                  <CardHeader>
                    <CardTitle>Billing</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Field label="Currency" name="currency" defaultValue={settings?.currency ?? "USD"} />
                    <Field label="JWT expiry" name="jwtExpiry" defaultValue={settings?.jwtExpiry ?? "7d"} />
                    <Field label="Minimum tip" name="minimumTip" type="number" step="0.01" defaultValue={settings?.minimumTip.toString() ?? "0"} />
                    <Field label="Transaction fee %" name="transactionFeePercent" type="number" step="0.01" defaultValue={settings?.transactionFeePercent.toString() ?? "0"} />
                    <Field label="USD to KES rate" name="usdToKesRate" type="number" step="0.01" defaultValue={settings?.usdToKesRate.toString() ?? "0"} />
                  </CardContent>
                </Card>

                <Card className="rounded-lg">
                  <CardHeader>
                    <CardTitle>PayPal</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Field label="Client ID" name="paypalClientId" defaultValue={settings?.paypalClientId ?? ""} />
                    <Field label="Client secret" name="paypalClientSecret" defaultValue={settings?.paypalClientSecret ?? ""} />
                  </CardContent>
                </Card>
              </div>

              {/* Right column: M-PESA */}
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>M-PESA</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <Field label="Consumer key" name="mpesaConsumerKey" defaultValue={settings?.mpesaConsumerKey ?? ""} />
                  <Field label="Consumer secret" name="mpesaConsumerSecret" defaultValue={settings?.mpesaConsumerSecret ?? ""} />
                  <Field label="Passkey" name="mpesaPasskey" defaultValue={settings?.mpesaPasskey ?? ""} />
                  <Field label="Shortcode" name="mpesaShortcode" defaultValue={settings?.mpesaShortcode ?? ""} />
                  <Field label="Store number" name="mpesaStoreNumber" defaultValue={settings?.mpesaStoreNumber ?? ""} />
                  <Field label="Shortcode type" name="mpesaShortcodeType" defaultValue={settings?.mpesaShortcodeType ?? "CustomerPayBillOnline"} />
                  <Field label="Environment" name="mpesaEnvironment" defaultValue={settings?.mpesaEnvironment ?? "sandbox"} />
                </CardContent>
              </Card>
            </div>

            <input type="hidden" name="appName" defaultValue={settings?.appName} />
            <input type="hidden" name="contactEmail" defaultValue={settings?.contactEmail ?? ""} />
            <input type="hidden" name="contactPhone" defaultValue={settings?.contactPhone ?? ""} />
            <input type="hidden" name="address" defaultValue={settings?.address ?? ""} />
            <input type="hidden" name="freeMemberSwipeLimit" defaultValue={String(settings?.freeMemberSwipeLimit ?? 20)} />
            <input type="hidden" name="showDiscoverAdAfterSwipes" defaultValue={String(settings?.showDiscoverAdAfterSwipes ?? 5)} />
            <input type="hidden" name="maxVideosUpload" defaultValue={String(settings?.maxVideosUpload ?? 10)} />
            <input type="hidden" name="allowVideoModeration" value={String(settings?.allowVideoModeration ?? false)} />
            <input type="hidden" name="showAds" value={String(settings?.showAds ?? false)} />
            <input type="hidden" name="allowFreeAccess" value={String(settings?.allowFreeAccess ?? false)} />
            <input type="hidden" name="allowVideoCall" value={String(settings?.allowVideoCall ?? true)} />
            <input type="hidden" name="allowVoiceCall" value={String(settings?.allowVoiceCall ?? true)} />
            <input type="hidden" name="allowSendImages" value={String(settings?.allowSendImages ?? true)} />

            <div className="flex justify-end">
              <SubmitButton type="submit">Save payment settings</SubmitButton>
            </div>
          </ActionForm>
        </TabsContent>

        <TabsContent value="storage">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Cloudflare R2 storage</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={saveR2SettingsAction} className="grid gap-4 md:grid-cols-2">
                <Field label="Account ID" name="r2AccountId" defaultValue={settings?.r2AccountId ?? ""} />
                <Field label="Access key ID" name="r2AccessKeyId" defaultValue={settings?.r2AccessKeyId ?? ""} />
                <Field label="Secret access key" name="r2SecretAccessKey" defaultValue={settings?.r2SecretAccessKey ?? ""} />
                <Field label="Bucket name" name="r2BucketName" defaultValue={settings?.r2BucketName ?? ""} />
                <Field label="Public base URL" name="r2PublicBaseUrl" defaultValue={settings?.r2PublicBaseUrl ?? ""} />
                <Field label="Region" name="r2Region" defaultValue={settings?.r2Region ?? "auto"} />
                <div className="md:col-span-2">
                  <Field label="Endpoint" name="r2Endpoint" defaultValue={settings?.r2Endpoint ?? ""} />
                </div>
                <div className="md:col-span-2">
                  <SubmitButton type="submit">Save storage settings</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <ActionForm action={saveNotificationSettingsAction} className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>Email provider</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <CheckboxField label="Enable email delivery" name="emailEnabled" checked={settings?.emailEnabled ?? false} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="SMTP host" name="smtpHost" defaultValue={settings?.smtpHost ?? ""} />
                    <Field label="SMTP port" name="smtpPort" type="number" defaultValue={String(settings?.smtpPort ?? 587)} />
                    <CheckboxField label="Use secure SMTP" name="smtpSecure" checked={settings?.smtpSecure ?? false} />
                    <div />
                    <Field label="SMTP user" name="smtpUser" defaultValue={settings?.smtpUser ?? ""} />
                    <Field label="SMTP password" name="smtpPassword" defaultValue={settings?.smtpPassword ?? ""} />
                    <Field label="From address" name="smtpFromAddress" defaultValue={settings?.smtpFromAddress ?? ""} />
                    <Field label="From name" name="smtpFromName" defaultValue={settings?.smtpFromName ?? ""} />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle>SMS provider</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <CheckboxField label="Enable SMS delivery" name="smsEnabled" checked={settings?.smsEnabled ?? false} />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Field
                        label="Provider API URL"
                        name="smsApiUrl"
                        defaultValue={settings?.smsApiUrl ?? "https://smsportal.hostpinnacle.co.ke/SMSApi/send"}
                      />
                    </div>
                    <Field label="Provider user ID" name="smsUserId" defaultValue={settings?.smsUserId ?? ""} />
                    <Field label="Provider password" name="smsPassword" defaultValue={settings?.smsPassword ?? ""} />
                    <Field label="Sender ID" name="smsSenderId" defaultValue={settings?.smsSenderId ?? ""} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle>OTP and recovery</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="OTP length" name="otpLength" type="number" defaultValue={String(settings?.otpLength ?? 6)} />
                <Field label="OTP expiry (minutes)" name="otpExpiryMinutes" type="number" defaultValue={String(settings?.otpExpiryMinutes ?? 10)} />
                <Field
                  label="Password reset expiry (minutes)"
                  name="passwordResetExpiryMinutes"
                  type="number"
                  defaultValue={String(settings?.passwordResetExpiryMinutes ?? 15)}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <SubmitButton type="submit">Save notification settings</SubmitButton>
            </div>
          </ActionForm>
        </TabsContent>

        <TabsContent value="security">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Security guidance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm leading-6">
                Keep sensitive credentials limited to authorized administrators and rotate them whenever operational ownership changes.
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm leading-6">
                Review payment and storage settings carefully before publishing changes to production environments.
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-4 text-sm leading-6">
                Use role-based admin accounts instead of shared logins so actions remain auditable and access can be revoked cleanly.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admins">
          <AdminTable adminUsers={adminUsers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  step,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string
  step?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} step={step} />
    </div>
  )
}

function CheckboxField({
  label,
  name,
  checked,
}: {
  label: string
  name: string
  checked: boolean
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-4 py-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 rounded border-input" />
      {label}
    </label>
  )
}
