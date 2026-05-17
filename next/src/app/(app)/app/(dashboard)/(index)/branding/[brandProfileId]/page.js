import { isValidObjectId } from "mongoose";
import { redirect } from "next/navigation";
import BrandProfileEditor from "@/components/dashboard/branding/BrandProfileEditor";
import { findManageableBrandProfile } from "@/lib/server/brandProfiles";
import { useServerAuth } from "@/lib/server/wrappers/auth";

export default async function ({ params }) {
  const { user } = await useServerAuth();
  const { brandProfileId } = await params;

  if (!isValidObjectId(brandProfileId)) redirect("/app/branding");

  const profile = await findManageableBrandProfile(user, brandProfileId);
  if (!profile) redirect("/app/branding");

  return (
    <BrandProfileEditor initialProfile={profile.toJsonAsClient()} isNew={false} />
  );
}
