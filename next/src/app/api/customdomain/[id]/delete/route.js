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

/**
 * @param {NextRequest} req
 */
export async function POST(req, { params }) {
  const auth = await useServerAuth()
  if (!auth) return NextResponse.json(resp("Unauthorized"), { status: 401 })
  const { user } = auth

  if (!canManageCustomDomains(user)) {
    return NextResponse.json(resp("Only the team Owner or Admin can manage custom domains."), { status: 403 })
  }

  const { id } = await params
  if (!mongoose.isValidObjectId(id)) {
    return NextResponse.json(resp("Invalid id"), { status: 400 })
  }

  await dbConnect()

  const domain = await CustomDomain.findOne({ _id: id, ...customDomainScopeQuery(user) })
  if (!domain) return NextResponse.json(resp("Not found"), { status: 404 })

  const snapshot = domain.toJsonAsClient()
  await domain.deleteOne()

  return NextResponse.json(resp({ customDomain: snapshot }))
}
