import { useServerAuth } from "@/lib/server/wrappers/auth";
import { listTransferRequestsForTeam } from "@/lib/server/serverUtils";
import { enrichTransferRequests } from "@/lib/server/transferRequests";
import RequestsSection from "../sections/RequestsSection";

export const metadata = { title: "Requests" };

export default async function TeamRequestsPage() {
  const { user, team } = await useServerAuth();

  const requestDocs = await listTransferRequestsForTeam(team);
  const requests = await enrichTransferRequests(requestDocs, "toJsonAsTeamAdmin");

  return (
    <RequestsSection requests={requests} role={user.role} />
  );
}
