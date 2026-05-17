import { NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import Team from "@/lib/server/mongoose/models/Team"
import { useTeamAdminAuth } from "@/lib/server/wrappers/teamAdminAuth"
import { resp } from "@/lib/server/serverUtils"

export async function POST() {
  await dbConnect()
  const admin = await useTeamAdminAuth()
  if (!admin || !admin.isOwner) return NextResponse.json(resp("Forbidden"), { status: 403 })

  const team = await Team.findById(admin.team._id)
  if (!team) return NextResponse.json(resp("Team not found"), { status: 404 })

  if (!team.onboarded) {
    team.onboarded = true
    await team.save()
  }

  return NextResponse.json(resp({ team: team.toJsonAsClient() }))
}
