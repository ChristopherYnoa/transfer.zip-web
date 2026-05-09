# Team Feature — Production Readiness TODO

## Critical (will break core functionality)

- [x] **`user.team` not set on invite acceptance** — `next/src/app/api/invite/[token]/route.js:60-72`
  When a user accepts an invite, they're added to `team.users[]` but `user.team` is never set. This means `user.hasTeam` will be `false` for every invited member, breaking permission checks, plan delegation, and the FloatingBar team link.

- [x] **AddUserButton broken and not wired up** — `next/src/app/(app)/app/team/AddUserButton.js:18` imports `inviteTeamMember` but the API exports `sendTeamInvite`. The component also isn't rendered anywhere on the team page — so there's no way to invite members from the UI.

- [ ] **No seat validation** — Neither the invite creation route (`next/src/app/api/team/invite/route.js`) nor the invite acceptance route checks `team.users.length < team.seats`. Users can exceed paid seat limits.

## High priority (security / data integrity)

- [ ] **Sessions not invalidated on member removal** — `next/src/app/api/team/users/[userId]/route.js:45-53` removes the user from the team but doesn't delete their sessions. Removed members keep access until cookies expire.

- [ ] **Subscription cancellation doesn't handle members** — `next/src/app/api/stripe/webhook/route.js:155-168` expires transfers but leaves team members intact with no plan.

- [ ] **Pending owner logic is fragile** — `next/src/app/api/stripe/webhook/route.js:84-93` has a TODO and checks `users.length == 0` which is race-condition prone.

- [ ] **Missing email format validation** on invite endpoint.

## Medium priority (UX gaps)

- [ ] **Team members (non-admin) have no team page access** — FloatingBar hides it, and `next/src/app/(app)/app/team/page.js:13` redirects members away. Consider a read-only view.

- [ ] **BrandProfile is per-user, not team-shared** — `next/src/lib/server/mongoose/models/BrandProfile.js:5` only has `author` (single user). Team members can't share branding.

- [ ] **Settings page shows nothing for team users** — `next/src/app/(app)/app/settings/SettingsPage.js:131` hides the plan card when `user.hasTeam` but doesn't show team plan info instead.

- [ ] **Team member names show email prefix** — `next/src/app/(app)/app/team/page.js:24` uses `email.split("@")[0]` as `fullName` since User model has no name field.

- [ ] **Typo**: "Deletetion failed" in `next/src/app/(app)/app/team/UserList.js:110`.
