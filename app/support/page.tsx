import { CustomerShell, SignInRequired } from "@/components/customer/customer-shell"
import { SupportCenter } from "@/components/customer/support-center"
import { getCurrentCustomerUser } from "@/lib/customer-web"
export default async function SupportPage() { const user = await getCurrentCustomerUser(); return <CustomerShell active="/support" signedIn={Boolean(user)}>{user ? <SupportCenter /> : <SignInRequired title="Sign in to contact support" />}</CustomerShell> }
