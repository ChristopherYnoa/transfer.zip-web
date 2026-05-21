import "server-only"
import { resolve4 } from "node:dns/promises"

import { ROLES } from "@/lib/roles"
import User from "./mongoose/models/User"
import { sendCustomDomainConnected } from "./mail/mail"

// Hosts a user's domain must resolve to (via A or CNAME chain) to count
// as pointing at us. Resolved fresh on every check — DNS TTLs do the
// caching.
const TARGET_HOSTS = ["transfer.zip"]

const ipsOf = async (host) => {
  try {
    return new Set(await resolve4(host))
  } catch {
    return new Set()
  }
}

/**
 * @param {string} domain
 * @returns {Promise<{verified: boolean, reason?: string}>}
 */
export async function verifyDomainResolves(domain) {
  const userIps = await ipsOf(domain)
  if (userIps.size === 0) {
    return { verified: false, reason: "domain-unresolvable" }
  }
  for (const target of TARGET_HOSTS) {
    const targetIps = await ipsOf(target)
    for (const ip of targetIps) {
      if (userIps.has(ip)) return { verified: true }
    }
  }
  return { verified: false, reason: "wrong-target" }
}

/**
 * Runs a DNS check against the doc's domain, persists the result, and
 * sends the "domain connected" email on the false → true transition only.
 * The flip only ever happens here, so the email can't fire twice.
 */
export async function runVerification(doc) {
  const wasVerified = doc.verified
  const result = await verifyDomainResolves(doc.domain)
  const now = new Date()
  doc.lastCheckedAt = now
  if (result.verified && !wasVerified) {
    doc.verified = true
    doc.verifiedAt = now
  }
  await doc.save()

  if (result.verified && !wasVerified) {
    try {
      await notifyDomainConnected(doc)
    } catch (err) {
      // Email failure must not roll back verification.
      console.error("sendCustomDomainConnected failed", err)
    }
  }
  return doc
}

async function notifyDomainConnected(doc) {
  let recipientEmail = null
  if (doc.team) {
    const owner = await User.findOne({ team: doc.team, role: ROLES.OWNER }).select("email").lean()
    recipientEmail = owner?.email
  } else if (doc.user) {
    const u = await User.findById(doc.user).select("email").lean()
    recipientEmail = u?.email
  }
  if (!recipientEmail) return
  await sendCustomDomainConnected(recipientEmail, {
    domain: doc.domain,
    link: `${process.env.SITE_URL || ""}/app/branding`,
  })
}
