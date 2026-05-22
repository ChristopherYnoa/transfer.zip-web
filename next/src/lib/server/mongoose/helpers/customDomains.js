import "server-only"

import CustomDomain from "../models/CustomDomain"
import { ROLES } from "@/lib/roles"

export const canManageCustomDomains = (user) =>
  !user.team || user.role === ROLES.OWNER || user.role === ROLES.ADMIN

// Selector for domains scoped to this user's ownership boundary.
export const customDomainScopeQuery = (user) => {
  if (user.team) return { team: user.team._id }
  return { user: user._id, team: { $exists: false } }
}

// Build the create payload for a new domain owned by this user.
// `user` is always the creator. `team` is set iff the user is on a team.
export const customDomainOwnershipFor = (user) => {
  const ownership = { user: user._id }
  if (user.team) ownership.team = user.team._id
  return ownership
}

export const listCustomDomainsForUser = (user) =>
  CustomDomain.find(customDomainScopeQuery(user)).sort({ createdAt: -1 })

// Look up the verified hostname for a Transfer/TransferRequest's
// ownership scope. Mirrors customDomainScopeQuery: prefer team when
// present (a transfer authored under a team keeps team branding even
// if the author later leaves), otherwise fall back to the author's
// personal domain. Returns the lowercase hostname or null.
export const getDownloadDomainFor = async ({ team, user } = {}) => {
  const query = team
    ? { team }
    : user ? { user, team: { $exists: false } } : null
  if (!query) return null
  const domain = await CustomDomain.findOne({ ...query, verified: true })
    .select("domain")
    .lean()
  return domain?.domain || null
}

// Zones whose root and any subdomain must never end up as a CustomDomain.
// transfer.zip is hardcoded so it's blocked even when SITE_URL points
// elsewhere in dev. SITE_URL / NEXT_PUBLIC_DL_DOMAIN catch any extra
// hostnames the deployment uses.
const reservedZones = () => {
  const zones = new Set(["transfer.zip"])
  if (process.env.SITE_URL) {
    zones.add(new URL(process.env.SITE_URL).hostname.toLowerCase())
  }
  if (process.env.NEXT_PUBLIC_DL_DOMAIN) {
    zones.add(process.env.NEXT_PUBLIC_DL_DOMAIN.toLowerCase())
  }
  return zones
}

export const isReservedDomain = (domain) => {
  const lower = domain.toLowerCase()
  for (const zone of reservedZones()) {
    if (lower === zone || lower.endsWith(`.${zone}`)) return true
  }
  return false
}
