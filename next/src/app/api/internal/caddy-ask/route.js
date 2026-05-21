import { NextRequest, NextResponse } from "next/server"
import dbConnect from "@/lib/server/mongoose/db"
import CustomDomain from "@/lib/server/mongoose/models/CustomDomain"

// Caddy's on-demand TLS "ask" endpoint. Called once per new SNI Caddy
// sees before it talks to Let's Encrypt. 2xx = issue a cert, anything
// else = drop the handshake. Body is ignored by Caddy, so we keep
// responses empty for speed.
//
// This route lives under /api/internal/* and MUST NOT be reachable from
// the public internet. The Caddyfile responds 404 for /api/internal/*
// on every public site block; only Caddy's own docker-network call to
// next:9001 lands here.

/**
 * @param {NextRequest} req 
 */
export async function GET(req) {
  const domain = req.nextUrl.searchParams.get("domain")
  if (!domain) return new NextResponse(null, { status: 400 })

  await dbConnect()
  const row = await CustomDomain.findOne({ domain, verified: true }).select("_id").lean()
  return new NextResponse(null, { status: row ? 200 : 404 })
}