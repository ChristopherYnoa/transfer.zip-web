import { NextRequest, NextResponse } from "next/server"

import CustomDomain from "@/lib/server/mongoose/models/CustomDomain"
import dbConnect from "@/lib/server/mongoose/db"
import { runVerification } from "@/lib/server/customDomainVerify"

// Internal-only batch verifier. Caddyfile blocks /api/internal/* from the
// public internet; only the worker (same docker network) reaches this.
//
// `lastCheckedAt` throttling: skip rows checked in the last 30s so that a
// client poll that just ran a fresh check doesn't get redone immediately
// by the cron.
const STALE_AFTER_MS = 30 * 1000
const BATCH_LIMIT = 100

/**
 * @param {NextRequest} req
 */
export async function POST(req) {
  await dbConnect()

  console.log("POST verify-pending")

  const cutoff = new Date(Date.now() - STALE_AFTER_MS)
  const domains = await CustomDomain.find({
    verified: false,
    $or: [
      { lastCheckedAt: { $exists: false } },
      { lastCheckedAt: { $lt: cutoff } },
    ],
  }).limit(BATCH_LIMIT)

  console.log("domains:", domains)

  let newlyVerified = 0
  for (const doc of domains) {
    const before = doc.verified
    await runVerification(doc)
    if (doc.verified && !before) newlyVerified++
  }

  return NextResponse.json({ success: true, checked: domains.length, newlyVerified })
}
