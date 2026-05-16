import BrandProfile from "@/lib/server/mongoose/models/BrandProfile";
import BrandProfileEditor from "@/components/dashboard/branding/BrandProfileEditor";

export const metadata = { title: "New brand profile" };

export default async function () {
  const brandProfile = new BrandProfile();
  return (
    <BrandProfileEditor
      isNew={true}
      initialProfile={brandProfile.toJsonAsClient()}
      backHref="/app/admin/branding"
    />
  );
}
