import crypto from "crypto"
import { sendMagicLink } from '@/lib/server/mail/mail'
import dbConnect from '@/lib/server/mongoose/db'
import MagicLink from '@/lib/server/mongoose/models/MagicLink'
import User from '@/lib/server/mongoose/models/User'
import { resp } from '@/lib/server/serverUtils'
import { NextResponse } from 'next/server'

export async function POST(req) {
  const data = await req.json()
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : ""

  if (!email) {
    return NextResponse.json(resp("Email is required"), { status: 400 })
  }

  await dbConnect()

  const existingUser = await User.findOne({ email: { $eq: email } })
  let user = existingUser
  if (!user) {
    user = new User({ email, onboarded: false })
    try {
      await user.save()
    } catch (err) {
      console.error('SIGNUP ERROR:', err)
      return NextResponse.json(resp("Could not create account"), { status: 409 })
    }
  }

  const token = crypto.randomUUID()
  const requestSecret = crypto.randomUUID()
  const code = MagicLink.generateCode()

  const magicLink = new MagicLink({
    user: user._id,
    token,
    code,
    requestSecret,
  })
  await magicLink.save()

  sendMagicLink(user.email, { link: `${process.env.SITE_URL}/magic-link/${magicLink.token}` })

  const response = NextResponse.json(resp({ requestId: magicLink._id.toString(), email }))
  // The requestSecret cookie binds the request to this browser. Scoped to the
  // magic-link path so it isn't sent on every unrelated request, and lives
  // only as long as the MagicLink itself (15m TTL) so we don't leave a
  // long-lived cookie hanging around after sign-in.
  response.cookies.set("mlReq", requestSecret, {
    domain: process.env.COOKIE_DOMAIN,
    httpOnly: true,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    maxAge: 15 * 60,
    path: "/api/auth/magic-link",
  })
  return response
}
