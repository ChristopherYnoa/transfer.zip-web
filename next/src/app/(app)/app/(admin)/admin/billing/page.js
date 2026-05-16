import { redirect } from "next/navigation";
import GenericPage from "@/components/dashboard/GenericPage";
import { ROLES } from "@/lib/roles";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import BillingSection from "../sections/BillingSection";

export const metadata = { title: "Billing" };

export default async function TeamBillingPage() {
  const { user, team } = await useServerAuth();

  // Layout admits Owner + Admin. Billing is Owner-only.
  if (user.role !== ROLES.OWNER) redirect("/app/admin");

  return (
    <GenericPage title="Billing">
      <BillingSection team={team.toJsonAsClient()} memberCount={team.users.length} />
    </GenericPage>
  );
}
