import TransferRequest from "@/lib/server/mongoose/models/TransferRequest"
import { resp } from "@/lib/server/serverUtils"
import { enrichTransferRequests, INACTIVE_PAGE_SIZE } from "@/lib/server/mongoose/helpers/transferRequests"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import { NextResponse } from "next/server"

const MAX_LIMIT = 50

export async function GET(req) {
  const auth = await useServerAuth()
  if (!auth) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const activeParam = searchParams.get("active")
  if (activeParam !== "true" && activeParam !== "false") {
    return NextResponse.json(resp("active must be 'true' or 'false'"), { status: 400 })
  }
  const active = activeParam === "true"

  const skipRaw = parseInt(searchParams.get("skip") || "0", 10)
  const limitRaw = parseInt(searchParams.get("limit") || String(INACTIVE_PAGE_SIZE), 10)
  const skip = Number.isFinite(skipRaw) && skipRaw > 0 ? skipRaw : 0
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : INACTIVE_PAGE_SIZE))

  // Peek one extra to detect hasMore without a separate countDocuments.
  const docs = await TransferRequest.find({ author: auth.user._id, active })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit + 1)

  const hasMore = docs.length > limit
  const slice = hasMore ? docs.slice(0, limit) : docs
  const requests = await enrichTransferRequests(slice)

  return NextResponse.json(resp({ requests, hasMore }))
}
