import { NextResponse } from "next/server"
import TeamEvent from "@/lib/server/mongoose/models/TeamEvent"
import { resp } from "@/lib/server/serverUtils"
import { useTeamAdminAuth } from "@/lib/server/wrappers/teamAdminAuth"
import dbConnect from "@/lib/server/mongoose/db"

export async function GET(req) {
  await dbConnect()
  const admin = await useTeamAdminAuth()
  if (!admin) return NextResponse.json(resp("Forbidden"), { status: 403 })

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200)

  const events = await TeamEvent.find({ team: admin.team._id })
    .populate("actor", "email fullName")
    .sort({ createdAt: -1 })
    .limit(limit)

  return NextResponse.json(resp({
    events: events.map(e => e.toJsonAsClient()),
  }))
}
