import BrandingPageShell from "@/components/dashboard/branding/BrandingPageShell";
import { listBrandProfilesForUser, canManageBrandProfiles } from "@/lib/server/brandProfiles";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { FEATURE } from "@/lib/pricing";

export const metadata = { title: "Branding" };

export default async function () {
  const { user } = await useServerAuth();

  const profiles = (await listBrandProfilesForUser(user)).map(p => p.toJsonAsClient());

  return (
    <BrandingPageShell
      profiles={profiles}
      hasFeature={user.hasFeature(FEATURE.CUSTOM_BRANDING)}
      canManage={canManageBrandProfiles(user)}
      newHref="/app/admin/branding/new"
      editHref={(id) => `/app/admin/branding/${id}`}
    />
  );
}
