import {prisma} from '@/lib/prisma'
import {requireSessionUser} from '@/lib/auth'
import {saveVaultPlan,saveVaultStoreConfig} from '@/lib/actions/vault-storage'
import {vaultQuota} from '@/lib/vault-accounting'

export default async function VaultStoragePage() {
  const session=await requireSessionUser()
  if (!['ADMIN','SUPER_ADMIN'].includes(session.role)) return <p>Access restricted.</p>
  const [plans,users,storeConfig]=await Promise.all([
    prisma.vaultStoragePlan.findMany({orderBy:[{capacityBytes:'asc'},{interval:'asc'}]}),
    prisma.user.findMany({where:{role:'USER'},select:{id:true,fullName:true,username:true},orderBy:{createdAt:'desc'},take:100}),
    prisma.vaultStoreConfig.findUnique({where:{id:1},select:{appleIssuerId:true,appleKeyId:true,applePrivateKeyEncrypted:true,androidAppLinkSha256:true}}),
  ])
  const usage=await Promise.all(users.map(async user=>({user,quota:await vaultQuota(user.id),referrals:await prisma.vaultReferral.count({where:{referrerUserId:user.id,completedAt:{not:null}}})})))
  return <main className="space-y-8"><header><h1 className="text-2xl font-semibold">Vault storage</h1><p className="text-sm text-muted-foreground">Configure draft plans and review vault usage. Plans cannot be sold until payment verification is configured.</p></header>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Store configuration</h2><p className="text-sm text-muted-foreground">Apple verification uses an App Store Connect API key. The private key is encrypted and cannot be viewed after saving. Android referral links require the Play App Signing SHA-256 fingerprint.</p>
    <form action={saveVaultStoreConfig} className="grid gap-3 rounded-xl border p-4 md:grid-cols-2">
      <label>Apple issuer ID<input name="appleIssuerId" defaultValue={storeConfig?.appleIssuerId??''} className="w-full rounded border p-2" /></label>
      <label>Apple key ID<input name="appleKeyId" defaultValue={storeConfig?.appleKeyId??''} className="w-full rounded border p-2" /></label>
      <label>Apple private key {storeConfig?.applePrivateKeyEncrypted?'(saved; leave blank to keep)':'(not configured)'}<textarea name="applePrivateKey" className="w-full rounded border p-2" autoComplete="off" rows={3} /></label>
      <label>Android SHA-256 fingerprints<textarea name="androidFingerprints" defaultValue={storeConfig?.androidAppLinkSha256??''} className="w-full rounded border p-2" rows={3} placeholder="One fingerprint per line" /></label>
      <button className="rounded bg-green-700 p-2 text-white">Save store configuration</button>
    </form></section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Storage plans</h2>
      <details className="rounded-xl border p-4"><summary className="cursor-pointer font-medium">Create a storage plan</summary>
      <form action={saveVaultPlan} className="mt-4 grid gap-2 md:grid-cols-4">
        <label>Name<input name="name" className="w-full rounded border p-2" required /></label>
        <label>Capacity (GiB)<input name="capacityGiB" type="number" min="1" max="10000" className="w-full rounded border p-2" required /></label>
        <label>Interval<select name="interval" className="w-full rounded border p-2"><option>MONTHLY</option><option>YEARLY</option></select></label>
        <label>Price<input name="price" type="number" min="0" step="0.01" className="w-full rounded border p-2" /></label>
        <label>Currency<input name="currency" defaultValue="USD" className="w-full rounded border p-2" required /></label>
        <label>Apple product ID<input name="appleProductId" className="w-full rounded border p-2" /></label>
        <label>Google product ID<input name="googleProductId" className="w-full rounded border p-2" /></label>
        <button className="rounded bg-green-700 p-2 text-white">Create draft</button>
      </form></details>{plans.map(plan=><form key={plan.id} action={saveVaultPlan} className="grid gap-2 rounded-xl border p-4 md:grid-cols-4">
      <input type="hidden" name="id" value={plan.id}/><label>Name<input name="name" defaultValue={plan.name} className="w-full rounded border p-2" required/></label>
      <label>Capacity (GiB)<input name="capacityGiB" type="number" min="1" defaultValue={Number(plan.capacityBytes)/1024**3} className="w-full rounded border p-2" required/></label>
      <label>Interval<select name="interval" defaultValue={plan.interval} className="w-full rounded border p-2"><option>MONTHLY</option><option>YEARLY</option></select></label>
      <label>Price<input name="price" type="number" min="0" step="0.01" defaultValue={plan.priceCents===null?'':plan.priceCents/100} className="w-full rounded border p-2"/></label>
      <label>Currency<input name="currency" defaultValue={plan.currency} className="w-full rounded border p-2" required/></label>
      <label>Apple product ID<input name="appleProductId" defaultValue={plan.appleProductId??''} className="w-full rounded border p-2"/></label>
      <label>Google product ID<input name="googleProductId" defaultValue={plan.googleProductId??''} className="w-full rounded border p-2"/></label>
      <button className="rounded bg-green-700 p-2 text-white">Save draft</button></form>)}</section>
    <section className="space-y-3"><h2 className="text-xl font-semibold">User usage</h2><p className="text-sm text-muted-foreground">Showing the 100 most recent accounts. Usage is incomplete until existing vault uploads have been reconciled.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>User</th><th>Used</th><th>Allowance</th><th>Referrals</th></tr></thead><tbody>{usage.map(({user,quota,referrals})=><tr key={user.id}><td>{user.fullName} {user.username?`(@${user.username})`:''}</td><td>{(quota.usedBytes/1024**2).toFixed(1)} MB</td><td>{(quota.limitBytes/1024**2).toFixed(1)} MB</td><td>{referrals}</td></tr>)}</tbody></table></div></section>
  </main>
}
