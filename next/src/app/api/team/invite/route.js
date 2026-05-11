import crypto from "crypto"
import { NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import TeamInvite from "@/lib/server/mongoose/models/TeamInvite"
import Team from "@/lib/server/mongoose/models/Team"
import User from "@/lib/server/mongoose/models/User"
import { sendTeamInvite } from "@/lib/server/mail/mail"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import { userHasLiveStripeSubscription } from "@/lib/server/stripe"
import { ROLES } from "@/lib/roles"

export async function POST(req) {
  const auth = await useServerAuth()
  if (!auth || !auth.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  if (auth.user.role !== ROLES.OWNER && auth.user.role !== ROLES.ADMIN) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const email = body.email?.trim().toLowerCase()
  const role = body.role === ROLES.ADMIN ? ROLES.ADMIN : ROLES.MEMBER

  if (!email) {
    return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 })
  }

  await dbConnect()

  const team = await Team.findOne({ users: auth.user._id })
  if (!team) {
    return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 })
  }

  const seats = team.seats || 0
  const existingInvite = await TeamInvite.findOne({ team: team._id, email })
  if (!existingInvite) {
    const pendingCount = await TeamInvite.countDocuments({ team: team._id })
    if (team.users.length + pendingCount + 1 > seats) {
      return NextResponse.json({ success: false, message: "No seats available. Upgrade your plan or remove a member or pending invite." }, { status: 409 })
    }
  }

  const existingUser = await User.findOne({ email: { $eq: email } })
  if (existingUser) {
    if (team.users.some(u => u.equals(existingUser._id))) {
      return NextResponse.json({ success: false, message: "User is already in this team" }, { status: 409 })
    }
    if (existingUser.team) {
      return NextResponse.json({ success: false, message: "User is already a member of another team" }, { status: 409 })
    }
    if (await userHasLiveStripeSubscription(existingUser)) {
      return NextResponse.json({ success: false, message: "User has an active subscription. They must cancel it before joining a team." }, { status: 409 })
    }
  }

  const token = crypto.randomUUID()
  await TeamInvite.findOneAndUpdate(
    { team: team._id, email },
    { email, role, token, invitedBy: auth.user._id, createdAt: new Date() },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || ""
  const link = `${baseUrl}/invite/${token}`
  await sendTeamInvite(email, {
    teamName: team.name,
    inviterEmail: auth.user.email,
    link
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(req) {
  const auth = await useServerAuth()
  if (!auth || !auth.user) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
  }

  if (auth.user.role !== ROLES.OWNER && auth.user.role !== ROLES.ADMIN) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
  }

  await dbConnect()

  const team = await Team.findOne({ users: auth.user._id })
  if (!team) {
    return NextResponse.json({ success: false, message: "Team not found" }, { status: 404 })
  }

  const { _id } = await req.json()

  const result = await TeamInvite.deleteOne({ _id, team: team._id })

  if (result.deletedCount === 0) {
    return NextResponse.json({ success: false, message: "Invite not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
