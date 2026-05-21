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

// Reserved hostnames that must never end up as a CustomDomain.
export const reservedHostnames = () => {
  const set = new Set()
  if (process.env.SITE_URL) {
    const host = new URL(process.env.SITE_URL).hostname.toLowerCase()
    set.add(host)
    set.add(`www.${host}`)
  }
  if (process.env.NEXT_PUBLIC_DL_DOMAIN) {
    set.add(process.env.NEXT_PUBLIC_DL_DOMAIN.toLowerCase())
  }
  return set
}
