import GenericPage from "@/components/dashboard/GenericPage";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import TeamEvent from "@/lib/server/mongoose/models/TeamEvent";
import AdminCard from "../AdminCard";
import ActivityFeed from "../sections/ActivityFeed";

export const metadata = { title: "Activity" };

export default async function TeamActivityPage() {
  const { team } = await useServerAuth();

  const events = await TeamEvent.find({ team: team._id })
    .populate("actor", "email fullName")
    .sort({ createdAt: -1 })
    .limit(200);

  const jsonEvents = events.map(e => e.toJsonAsClient());

  return (
    <GenericPage title="Activity">
      <AdminCard>
        {jsonEvents.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No team activity yet.
          </div>
        ) : (
          <ActivityFeed events={jsonEvents} />
        )}
      </AdminCard>
    </GenericPage>
  );
}
