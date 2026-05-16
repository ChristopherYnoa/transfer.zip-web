import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import BrandingPageShell from "@/components/dashboard/branding/BrandingPageShell";
import { listBrandProfilesForUser, canManageBrandProfiles } from "@/lib/server/brandProfiles";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { FEATURE } from "@/lib/pricing";
import { ROLES } from "@/lib/roles";

export default async function () {
  const { user } = await useServerAuth();

  // Team users manage branding inside the admin panel. Members lose
  // access entirely; Owner/Admin are redirected to the team-scoped view.
  if (user.hasTeam) {
    if (user.role === ROLES.OWNER || user.role === ROLES.ADMIN) {
      redirect("/app/admin/branding");
    }
    redirect("/app");
  }

  const profiles = (await listBrandProfilesForUser(user)).map(p => p.toJsonAsClient());

  return (
    <BrandingPageShell
      profiles={profiles}
      hasFeature={user.hasFeature(FEATURE.CUSTOM_BRANDING)}
      canManage={canManageBrandProfiles(user)}
      newHref="/app/branding/new"
      editHref={(id) => `/app/branding/${id}`}
      emptyCta={
        <Button asChild>
          <Link className="mt-4" href="/app/settings?upgrade">Upgrade to Pro &rarr;</Link>
        </Button>
      }
    />
  );
}
