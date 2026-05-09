import GenericPage from "@/components/dashboard/GenericPage";
import { ROLES } from "@/lib/roles";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { redirect } from "next/navigation";
import TeamPage from "./TeamPage";
import UserList from "./UserList";
import AddUserButton from "./AddUserButton";
import TeamInvite from "@/lib/server/mongoose/models/TeamInvite";

export default async function () {
  const auth = await useServerAuth()
  const { user, team } = auth

  if (!user.hasTeam || user.role == ROLES.MEMBER) {
    redirect("/app")
  }

  await team.populate("users")

  const invites = await TeamInvite.find({ team: team._id })

  const teamUsers = team.users.map(u => ({
    id: u._id.toString(),
    email: u.email,
    fullName: u.email.split("@")[0],
    roles: [u.role]
  }))

  const currentUser = {
    id: user._id.toString(),
    roles: [user.role]
  }

  const storage = await user.getStorage()

  return (
    <GenericPage title={"Team"}>
      <div className="p-5 sm:p-6 bg-white rounded-xl mb-4">
        <div className="sm:col-span-full">
          <UserList
            users={teamUsers}
            user={currentUser}
            invites={invites.map(inv => inv.friendlyObj())}
          />
          <div className="mt-4 flex items-center gap-4">
            <p className="text-gray-600 flex-1 whitespace-nowrap">
              Using {teamUsers.length}/{team.seats} members on your plan
            </p>
            <AddUserButton />
          </div>
        </div>
      </div>
      <TeamPage user={user.friendlyObj()} storage={storage} team={team.friendlyObj()} />
    </GenericPage>
  )
}