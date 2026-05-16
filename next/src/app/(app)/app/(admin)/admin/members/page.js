import GenericPage from "@/components/dashboard/GenericPage";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import TeamInvite from "@/lib/server/mongoose/models/TeamInvite";
import MembersSection from "../sections/MembersSection";

export const metadata = { title: "Members" };

export default async function TeamMembersPage() {
  const { user, team } = await useServerAuth();

  await team.populate({ path: "users", populate: { path: "team" } });
  const invites = await TeamInvite.find({ team: team._id });

  return (
    <GenericPage title="Members">
      <MembersSection
        currentUser={user.toJsonAsClient()}
        teamUsers={team.users.map(u => u.toJsonAsClient())}
        invites={invites.map(inv => inv.toJsonAsClient())}
        seats={team.seats}
      />
    </GenericPage>
  );
}
