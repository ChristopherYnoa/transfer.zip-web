import AddUserButton from "../AddUserButton";
import UserList from "../UserList";
import AdminCard from "../AdminCard";

export default function MembersSection({ currentUser, teamUsers, invites, seats }) {
  return (
    <AdminCard>
      <UserList user={currentUser} users={teamUsers} invites={invites} />
      <div className="mt-4 flex items-center gap-4">
        <p className="text-gray-600 flex-1 text-sm">
          {teamUsers.length}/{seats} seats used
          {invites.length > 0 && ` · ${invites.length} pending`}
        </p>
        <AddUserButton />
      </div>
    </AdminCard>
  );
}
