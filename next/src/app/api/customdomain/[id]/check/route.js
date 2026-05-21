import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"

import CustomDomain from "@/lib/server/mongoose/models/CustomDomain"
import dbConnect from "@/lib/server/mongoose/db"
import { resp } from "@/lib/server/serverUtils"
import { useServerAuth } from "@/lib/server/wrappers/auth"
import {
  canManageCustomDomains,
  customDomainScopeQuery,
} from "@/lib/server/mongoose/helpers/customDomains"
import { runVerification } from "@/lib/server/customDomainVerify"
import { getCustomDomainCheckRateLimiter } from "@/lib/server/rate-limits/rateLimiters"

/**
 * @param {NextRequest} req
 */
export async function GET(req, { params }) {
  const auth = await useServerAuth()
  if (!auth) return NextResponse.json(resp("Unauthorized"), { status: 401 })
  const { user } = auth

  if (!canManageCustomDomains(user)) {
    return NextResponse.json(resp("Forbidden"), { status: 403 })
  }

  const { id } = await params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json(resp("Invalid id"), { status: 400 })
  }

  await dbConnect()

  const limiter = getCustomDomainCheckRateLimiter(mongoose)
  try {
    await limiter.consume(user._id.toString())
  } catch {
    return NextResponse.json(resp("Too many DNS checks. Wait a moment."), { status: 429 })
  }

  const domain = await CustomDomain.findOne({ _id: id, ...customDomainScopeQuery(user) })
  if (!domain) return NextResponse.json(resp("Not found"), { status: 404 })

  await runVerification(domain)

  return NextResponse.json(resp({ customDomain: domain.toJsonAsClient() }))
}
