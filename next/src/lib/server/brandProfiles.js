import "server-only"
import BrandProfile from "./mongoose/models/BrandProfile"
import { ROLES } from "@/lib/roles"

// Single source of truth for which brand profiles a user can see, use,
// or manage. Every API route and server page that touches BrandProfile
// goes through one of the helpers below — don't write ad-hoc queries
// that bypass these rules.
//
// Rules:
//   Solo user (no team)      → personal profiles (author=user, team unset)
//   Team Owner / Admin       → team profiles (team=user.team) — can manage
//   Team Member              → team profiles (team=user.team) — can use, NOT manage

export const canManageBrandProfiles = (user) =>
    !user.team || user.role === ROLES.OWNER || user.role === ROLES.ADMIN

// Selector for profiles the user can use (apply to a transfer, see in picker).
export const brandProfileScopeQuery = (user) => {
    if (user.team) return { team: user.team._id }
    return { author: user._id, team: { $exists: false } }
}

// Build the create payload for a new profile owned by this user.
// Author is always the creator. Team is set iff the user is on a team.
export const brandProfileOwnershipFor = (user) => {
    const ownership = { author: user._id }
    if (user.team) ownership.team = user.team._id
    return ownership
}

// Find a profile the user is entitled to USE (e.g. apply to a transfer).
// Members on a team can use team profiles even though they can't manage them.
export const findUsableBrandProfile = (user, id) =>
    BrandProfile.findOne({ _id: id, ...brandProfileScopeQuery(user) })

// Find a profile the user is entitled to MANAGE (edit / delete).
// Returns null for Members on a team since they can't manage anything.
export const findManageableBrandProfile = (user, id) => {
    if (!canManageBrandProfiles(user)) return Promise.resolve(null)
    return BrandProfile.findOne({ _id: id, ...brandProfileScopeQuery(user) })
}

// List every profile in the user's scope. Used by the branding management
// page and the picker.
export const listBrandProfilesForUser = (user) =>
    BrandProfile.find(brandProfileScopeQuery(user)).sort({ lastUsed: -1, createdAt: -1 })
