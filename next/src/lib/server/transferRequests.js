import "server-only"
import Transfer from "./mongoose/models/Transfer"

export const INACTIVE_PAGE_SIZE = 10

// Augment a list of TransferRequest docs with the count and preview of
// transfers received via each. The preview powers the cascade-delete
// confirmation dialog on the dashboard.
export async function enrichTransferRequests(transferRequestDocs) {
  return Promise.all(transferRequestDocs.map(async request => {
    const transfers = await Transfer.find({
      transferRequest: request._id,
      "files.0": { $exists: true }
    }).select("_id name files").sort({ createdAt: -1 })

    return {
      ...request.toJsonAsOwner(),
      receivedTransfersCount: transfers.length,
      receivedTransfers: transfers.map(t => ({
        id: t._id.toString(),
        name: t.name || "Untitled Transfer",
        fileCount: t.files?.length || 0,
      })),
    }
  }))
}
