import { NextResponse } from "next/server"
import TeamEvent from "@/lib/server/mongoose/models/TeamEvent"
import { resp } from "@/lib/server/serverUtils"
import { useTeamAdminAuth } from "@/lib/server/wrappers/teamAdminAuth"
import dbConnect from "@/lib/server/mongoose/db"
import { typesForFilter, ACTIVITY_PAGE_SIZE } from "@/lib/activityFilters"

export async function GET(req) {
  await dbConnect()
  const admin = await useTeamAdminAuth()
  if (!admin) return NextResponse.json(resp("Forbidden"), { status: 403 })

  const url = new URL(req.url)
  const filter = url.searchParams.get("filter") || "all"
  const before = url.searchParams.get("before")

  const query = { team: admin.team._id }
  const types = typesForFilter(filter)
  if (types) query.type = { $in: types }
  if (before) query.createdAt = { $lt: new Date(before) }

  // Fetch one extra to detect whether there's another page after this one.
  const rows = await TeamEvent.find(query)
    .populate("actor", "email fullName")
    .sort({ createdAt: -1 })
    .limit(ACTIVITY_PAGE_SIZE + 1)

  const hasMore = rows.length > ACTIVITY_PAGE_SIZE
  const events = (hasMore ? rows.slice(0, ACTIVITY_PAGE_SIZE) : rows).map(e => e.toJsonAsClient())

  return NextResponse.json(resp({ events, hasMore }))
}
