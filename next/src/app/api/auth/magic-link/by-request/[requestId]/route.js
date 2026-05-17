import { cookies } from "next/headers"
import mongoose from "mongoose"
import { NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import MagicLink from "@/lib/server/mongoose/models/MagicLink"
import { resp } from "@/lib/server/serverUtils"

// Polled by the browser that requested the magic link to detect when the link
// has been opened (so it can switch to code entry) or consumed elsewhere (so
// it can redirect to /app).
export async function GET(req, { params }) {
  const { requestId } = await params
  if (!requestId || !mongoose.isValidObjectId(requestId)) {
    return NextResponse.json(resp("Invalid request"), { status: 400 })
  }

  await dbConnect()

  const cookieStore = await cookies()
  const mlReqCookie = cookieStore.get("mlReq")?.value
  if (!mlReqCookie) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 })
  }

  const magicLink = await MagicLink.findById(requestId)
  if (!magicLink) {
    return NextResponse.json(resp({ status: "expired" }))
  }
  if (magicLink.requestSecret !== mlReqCookie) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 })
  }

  let status = "pending"
  if (magicLink.consumed) {
    status = magicLink.openedSameBrowser ? "consumed-same-browser" : "consumed"
  } else if (magicLink.opened) {
    status = "opened-other-device"
  }

  return NextResponse.json(resp({ status }))
}
