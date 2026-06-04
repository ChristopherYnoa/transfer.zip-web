import GenericPage from "@/components/dashboard/GenericPage"
import TransferList from "@/components/dashboard/TransferList"
import EmptySpace from "@/components/elements/EmptySpace"
import { listSentAndReceivedForUser } from "@/lib/server/serverUtils"
import { useServerAuth } from "@/lib/server/wrappers/auth"

export default async function () {
  const { user } = await useServerAuth()
  const { received } = await listSentAndReceivedForUser(user)
  const receivedTransfersJson = await Promise.all(received.map(transfer => transfer.toJsonAsOwner()))

  return (
    <GenericPage title={"Received"}>
      <TransferList transfers={receivedTransfersJson} emptyFallback={(
        <EmptySpace title={"Your Received Transfers"} subtitle={"Received files from transfer requests will appear here."} />
      )} />
    </GenericPage>
  )
}