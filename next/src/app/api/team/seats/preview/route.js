import { NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import Team from "@/lib/server/mongoose/models/Team"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import { previewSeatPurchase } from "@/lib/server/teamSeats"
import { logError } from "@/lib/server/errors"
import { ROLES } from "@/lib/roles"

export async function POST(req) {
  const auth = await useServerAuth()
  if (!auth || !auth.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  if (auth.user.role !== ROLES.OWNER && auth.user.role !== ROLES.ADMIN) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const count = Number.isInteger(body.count) && body.count > 0 ? body.count : 1

  await dbConnect()

  const team = await Team.findOne({ users: auth.user._id })
  if (!team) {
    return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 })
  }

  try {
    const preview = await previewSeatPurchase(team, count)
    return NextResponse.json({ success: true, preview })
  } catch (err) {
    logError(err).forRoute("api/team/seats/preview/POST")
    return NextResponse.json({ success: false, message: err.message }, { status: 400 })
  }
}
