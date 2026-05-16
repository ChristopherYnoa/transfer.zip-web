import GenericPage from "@/components/dashboard/GenericPage";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import TeamEvent from "@/lib/server/mongoose/models/TeamEvent";
import { listTransfersForTeam } from "@/lib/server/serverUtils";
import OverviewSection from "./sections/OverviewSection";

export const metadata = { title: "Overview" };

export default async function TeamOverviewPage() {
  // Layout already gated this — auth + admin role guaranteed.
  const { user, team } = await useServerAuth();

  await team.populate({ path: "users", populate: { path: "team" } });

  const [transfers, recentEvents] = await Promise.all([
    listTransfersForTeam(team),
    TeamEvent.find({ team: team._id })
      .populate("actor", "email fullName")
      .sort({ createdAt: -1 })
      .limit(6),
  ]);

  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const transfersThisMonth = transfers.filter(t => t.createdAt >= firstOfMonth).length;
  const totalDownloads = transfers.reduce((sum, t) => sum + (t.downloads?.length || 0), 0);
  const totalStorageBytes = transfers.reduce((sum, t) => sum + (t.size || 0), 0);

  return (
    <GenericPage title="Admin">
      <OverviewSection
        team={team.toJsonAsClient()}
        memberCount={team.users.length}
        stats={{
          totalTransfers: transfers.length,
          transfersThisMonth,
          totalDownloads,
          totalStorageBytes,
        }}
        recentEvents={recentEvents.map(e => e.toJsonAsClient())}
        role={user.role}
      />
    </GenericPage>
  );
}
