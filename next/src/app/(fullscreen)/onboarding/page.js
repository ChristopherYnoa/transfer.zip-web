import { useServerAuth } from "@/lib/server/wrappers/auth";
import OnboardingPage from "./OnboardingPage";
import { redirect } from "next/navigation";
import { doesUserHaveFreeTrial } from "@/lib/server/serverUtils";
import { cookies } from "next/headers";
import { ROLES } from "@/lib/roles";

export default async function () {
  const auth = await useServerAuth()
  if (!auth) {
    return redirect("/signin")
  }

  // Owners of a paid-but-unconfigured team go through team onboarding, not
  // the solo plan picker.
  if (auth.user.hasTeam && auth.user.role === ROLES.OWNER && !auth.user.team.onboarded) {
    return redirect("/onboarding-team")
  }

  // Check if user already has active plan
  if (auth.user.getPlan() != "free") {
    return redirect("/app")
  }

  let hasFreeTrial = await doesUserHaveFreeTrial(auth.user, await cookies())

  return <OnboardingPage user={auth.user.toJsonAsClient()} hasStripeAccount={!!auth.user.stripe_customer_id} hasFreeTrial={hasFreeTrial} />
}