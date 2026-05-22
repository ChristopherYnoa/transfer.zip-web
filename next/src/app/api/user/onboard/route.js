import { NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import User from "@/lib/server/mongoose/models/User"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import { resp } from "@/lib/server/serverUtils"

export async function POST() {
  await dbConnect()
  const auth = await useServerAuth()
  if (!auth) return NextResponse.json(resp("Unauthorized"), { status: 401 })

  if (!auth.user.onboarded) {
    await User.updateOne({ _id: auth.user._id }, { $set: { onboarded: true } })
  }

  return NextResponse.json(resp({}))
}
