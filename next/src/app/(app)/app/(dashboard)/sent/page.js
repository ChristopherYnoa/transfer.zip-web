import GenericPage from "@/components/dashboard/GenericPage"
import TransferList from "@/components/dashboard/TransferList"
import { listSentAndReceivedForUser } from "@/lib/server/serverUtils"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import EmptySpace from "@/components/elements/EmptySpace"

export default async function ({ children }) {
  const { user } = await useServerAuth()
  const { sent } = await listSentAndReceivedForUser(user)
  const sentTransfersJson = await Promise.all(sent.map(transfer => transfer.toJsonAsOwner()))

  return (
    <GenericPage title={"Sent"}>
      <TransferList transfers={sentTransfersJson} emptyFallback={(
        <EmptySpace title={"Your Sent Transfers"} subtitle={"Transfers you have sent will appear here. Go ahead and send some files!"} />
      )} />
      {children}
    </GenericPage>
  )
}