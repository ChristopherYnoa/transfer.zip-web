import GenericPage from "@/components/dashboard/GenericPage";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { listTransfersForTeam } from "@/lib/server/serverUtils";
import TransfersSection from "../sections/TransfersSection";

export const metadata = { title: "Transfers" };

export default async function TeamTransfersPage() {
  const { user, team } = await useServerAuth();

  const transfers = await listTransfersForTeam(team);

  return (
    <GenericPage title="Transfers">
      <TransfersSection
        transfers={transfers.map(t => t.toJsonAsTeamAdmin())}
        role={user.role}
      />
    </GenericPage>
  );
}
