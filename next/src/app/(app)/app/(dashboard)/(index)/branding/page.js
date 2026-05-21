import { redirect } from "next/navigation";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { ROLES } from "@/lib/roles";
import BrandingPage from "@/components/dashboard/branding/BrandingPage";

export default async function () {
  const { user } = await useServerAuth();
  if (user.hasTeam) {
    redirect(user.role === ROLES.OWNER || user.role === ROLES.ADMIN ? "/app/admin/branding" : "/app");
  }
  return <BrandingPage />;
}
