import { NextResponse } from "next/server"
import { resp, listTransfersForTeam } from "@/lib/server/serverUtils"
import { useTeamAdminAuth } from "@/lib/server/wrappers/teamAdminAuth"
import dbConnect from "@/lib/server/mongoose/db"

export async function GET() {
  await dbConnect()
  const admin = await useTeamAdminAuth()
  if (!admin) return NextResponse.json(resp("Forbidden"), { status: 403 })

  const transfers = await listTransfersForTeam(admin.team)
  return NextResponse.json(resp({
    transfers: transfers.map(t => t.toJsonAsTeamAdmin()),
  }))
}
