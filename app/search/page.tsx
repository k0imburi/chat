import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { GlobalSearch } from "@/components/customer/global-search"
import { getCurrentCustomerUser } from "@/lib/customer-web"

export default async function SearchPage() {
  const user = await getCurrentCustomerUser()
  return <CustomerShell active="/search" signedIn={Boolean(user)}>{user ? <GlobalSearch /> : <SignInRequired title="Sign in to search ChatAndTip" />}</CustomerShell>
}
