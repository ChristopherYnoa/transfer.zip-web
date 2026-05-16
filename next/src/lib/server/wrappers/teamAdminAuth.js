import "server-only"
import { ROLES } from "@/lib/roles"
import { useServerAuth } from "./auth"

// Resolves to a team-admin context (Owner or Admin of a team), or null.
// Use in API routes and server pages that should only be reachable by
// the people allowed inside the admin panel.
//
// Returns the same shape as useServerAuth() plus `isOwner` for routes
// that need to further restrict (e.g. delete other members' transfers).
export async function useTeamAdminAuth() {
    const auth = await useServerAuth()
    if (!auth) return null

    const { user, team } = auth
    if (!team) return null
    if (user.role !== ROLES.OWNER && user.role !== ROLES.ADMIN) return null

    return {
        ...auth,
        isOwner: user.role === ROLES.OWNER,
    }
}
