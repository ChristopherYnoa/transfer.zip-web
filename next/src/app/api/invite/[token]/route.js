import { NextResponse } from "next/server"
import { createCookieParams, resp } from "@/lib/server/serverUtils"
import dbConnect from "@/lib/server/mongoose/db"
import TeamInvite from "@/lib/server/mongoose/models/TeamInvite"
import Team from "@/lib/server/mongoose/models/Team"
import User from "@/lib/server/mongoose/models/User"
import Session from "@/lib/server/mongoose/models/Session"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import { userHasLiveStripeSubscription } from "@/lib/server/stripe"

export async function GET(req, { params }) {
  const { token } = await params
  if (!token) {
    return NextResponse.json(resp("Token is required"), { status: 400 })
  }

  await dbConnect()

  const invite = await TeamInvite.findOne({ token: { $eq: token } })
  if (!invite) {
    return NextResponse.json(resp("Invite not found"), { status: 404 })
  }

  const team = await Team.findById(invite.team)
  if (!team) {
    return NextResponse.json(resp("Team not found"), { status: 404 })
  }

  return NextResponse.json(resp({
    email: invite.email,
    role: invite.role,
    teamName: team.name
  }))
}

export async function POST(req, { params }) {
  const { token } = await params
  if (!token) {
    return NextResponse.json(resp("Token is required"), { status: 400 })
  }

  const body = await req.json()
  const password = body.password

  await dbConnect()

  const invite = await TeamInvite.findOne({ token: { $eq: token } })
  if (!invite) {
    return NextResponse.json(resp("Invite not found"), { status: 404 })
  }

  const team = await Team.findById(invite.team)
  if (!team) {
    return NextResponse.json(resp("Team not found"), { status: 404 })
  }

  if (team.users.length >= (team.seats || 0)) {
    return NextResponse.json(resp("This team has no available seats. Ask an owner or admin to free up a seat."), { status: 409 })
  }

  const existingUser = await User.findOne({ email: { $eq: invite.email } })

  let user
  let session

  if (existingUser) {
    const auth = await useServerAuth()
    if (!auth || !auth.user._id.equals(existingUser._id)) {
      return NextResponse.json(resp(`Please sign in as ${invite.email} to accept this invite`), { status: 401 })
    }

    if (team.users.some(u => u.equals(existingUser._id))) {
      return NextResponse.json(resp("You are already in this team"), { status: 409 })
    }
    if (existingUser.team) {
      return NextResponse.json(resp("You are already a member of another team"), { status: 409 })
    }
    if (await userHasLiveStripeSubscription(existingUser)) {
      return NextResponse.json(resp("You have an active subscription. Cancel it before joining a team."), { status: 409 })
    }

    existingUser.team = team._id
    existingUser.role = invite.role
    await existingUser.save()

    user = existingUser
    session = auth
  } else {
    const newUser = new User({
      email: invite.email,
      role: invite.role,
      team: team._id,
    })

    if (password) {
      newUser.setPassword(password)
    }

    await newUser.save()

    user = newUser
  }

  team.users.push(user._id)
  await team.save()

  await TeamInvite.deleteOne({ _id: invite._id })

  const response = NextResponse.json(resp({}), { status: 200 })
  if (!session) {
    const newSession = new Session({ user: user._id })
    await newSession.save()
    response.cookies.set("token", newSession.token, createCookieParams())
  }
  return response
}
