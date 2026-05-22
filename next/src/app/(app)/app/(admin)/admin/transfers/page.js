import { useServerAuth } from "@/lib/server/wrappers/auth";
import { listTransfersForTeam } from "@/lib/server/serverUtils";
import { LIMIT } from "@/lib/pricing";
import TransfersSection from "../sections/TransfersSection";

export const metadata = { title: "Transfers" };

export default async function TeamTransfersPage() {
  const { user, team } = await useServerAuth();

  const transfers = await listTransfersForTeam(team);
  const transfersJson = await Promise.all(transfers.map(t => t.toJsonAsTeamAdmin()));
  const maxExpiryDays = team.getLimit(LIMIT.MAX_EXPIRY_DAYS) || 0;

  return (
    <TransfersSection
      transfers={transfersJson}
      role={user.role}
      maxExpiryDays={maxExpiryDays}
    />
  );
}
