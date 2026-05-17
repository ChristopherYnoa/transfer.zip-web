# Team Feature — Production TODO

Scope: ship a credible WeTransfer-style team plan. Owners/Admins manage seats and invites; team members share branding; only the Owner can inspect other members' transfers; billing reflects reality. Skipping enterprise-only stuff (SSO/SAML/LDAP, audit-trail compliance exports) — not the bar we're shooting for yet.

Legend: 🔴 blocks production · 🟠 broken core team value · 🟡 needs to work before launch · 🟢 polish

---

## 🔴 Critical bugs — broken right now

- [x] **`deleteUser` API call is broken.** `next/src/lib/client/Api.js:143` calls `del(...)` which doesn't exist (only `withBody` is exported). Removing a team member from the UI throws `ReferenceError`. Change to `withBody("delete", \`/team/users/${userId}\`)`.

- [x] **Stripe seat quantity never persists to `Team.seats`.** `next/src/app/api/stripe/webhook/route.js:74` reads `const seats = item.quantity` but `handleSubscription` never writes it. `Team.seats` only reflects what was set at checkout — any seat upgrade/downgrade in Stripe is silently ignored. Pass `seats` through `updateSubscription({...})` and persist it on the Team model.

- [x] **No seat enforcement.** Neither `POST /api/team/invite` (`route.js`) nor `POST /api/invite/[token]` checks `team.users.length + pendingInvites < team.seats`. Owners can invite unlimited members regardless of paid quantity. Add a guard in both routes, and ideally surface remaining seats in the UI.

- [x] **Sessions not invalidated on member removal.** `api/team/users/[userId]/route.js` `$pull`s the user and unsets `team`, but their session cookie is still valid until expiry — they continue to act as a logged-in user with stale team context cached. Delete the user's sessions on removal.

<!-- - [ ] **Pending-owner promotion is race-prone.** `api/stripe/webhook/route.js:84-92` (with its own `TODO`) decides "this is the owner" by checking `users.length === 0`. Two near-simultaneous webhook deliveries, a manually-added user, or a retry can leave the team owner-less or with the wrong owner. Use the `pendingOwner` field as the authoritative source and clear it atomically. -->

## 🟠 Core team value is missing

These are the things that make "team plan" actually mean something. Today the feature is effectively "shared billing".

- [x] **Transfers are not team-scoped.** Added `Transfer.team` (denormalized at creation in [api/transfer/new/route.js](next/src/app/api/transfer/new/route.js#L181), never updated thereafter). `listTransfersForTeam` in [serverUtils.js](next/src/lib/server/serverUtils.js) drives the team-wide list at `/app/admin/transfers`. Owner-only `POST /api/team/transfers/:id/delete` and `PUT /api/team/transfers/:id` (expiry update) gate write actions via `useTeamAdminAuth().isOwner`. UI in [TransfersSection.js](next/src/app/(app)/app/(admin)/admin/sections/TransfersSection.js) has author filter, search, copy link, Extend dialog (+7d / +30d / +90d / custom / set-to-max), Delete confirm. Members continue to see only their own transfers via the unchanged `listTransfersForUser`. New `toJsonAsTeamAdmin()` strips the plaintext password but includes author identity.

- [x] **BrandProfile is team-scoped.** Added `BrandProfile.team` (set once at creation from the creator's team) and a single scope helper in [next/src/lib/server/brandProfiles.js](next/src/lib/server/brandProfiles.js) that every route goes through. Team Owner/Admin manage profiles from `/app/admin/branding`; Members see team profiles in the transfer picker but can't manage. Solo Pro users keep `/app/branding` unchanged. Shared UI in [components/dashboard/branding/](next/src/components/dashboard/branding/).

<!-- - [ ] **TransferRequest (request links) is per-user.** Same problem — `TransferRequest.author` is a single user. A teammate can't pick up incoming files when the requester is OOO. Add team scoping or at minimum a "team request link" mode. -->

- [x] **Storage limits are ambiguous and probably wrong.** ~~Pricing says 500GB *per seat* but `User.getStorage()` just calls `getMaxStorageForPlan(this.getPlan())` — each member independently gets 500GB regardless of seat count.~~ Bumped Teams plan storage to **1TB per seat, each user gets 1TB independently** (no aggregation). At 1TB per member this will never realistically be hit, so pooled storage isn't worth building.

<!-- - [ ] **Custom domains are stubbed.** `BrandProfile.js:20` has `// TODO: custom domains` and the `domain` field is commented out, yet the Teams plan markets `CUSTOM_DOMAIN`. Either ship it (DNS verification, cert via Caddy, routing in `next.config.js`) or remove from the plan features. --> (will implement later)

## 🟡 Needs to work before launch

### First-run setup
- [x] **Team onboarding wizard after checkout.** Added a 3-step fullscreen wizard at [/onboarding-team](next/src/app/(fullscreen)/onboarding-team/) — team name → invites → brand profile (last two optional). New `Team.onboarded` flag (default `false`); flipped to `true` via Owner-only `POST /api/team/onboard` on Finish. The [/app](next/src/app/(app)/app/layout.js) and [/app/admin](next/src/app/(app)/app/(admin)/layout.js) layouts both redirect an Owner-of-unonboarded-team to the wizard. Each step reuses an existing endpoint — `PUT /api/team` (name), `POST /api/team/invite` looped client-side (invites, capped at remaining seats — no auto-purchase in this flow), `POST /api/brandprofile/new` (brand). The pre-existing `/onboarding` page also redirects here if it'd otherwise show a solo plan picker to an Owner mid-team-setup.

### Membership lifecycle
- [x] **Transfer ownership on member exit.** Reassign to Owner. On member removal ([api/team/users/[userId]/route.js](next/src/app/api/team/users/[userId]/route.js) DELETE), `Transfer.updateMany({ author: removedId, team: teamId }, { author: ownerId })` runs before the user is detached. Three reasons we picked reassignment over orphaning: (a) the team keeps managing the data, (b) the now-solo ex-member can't reach back in via `/api/transfer/:id` (authorizes by `author`), (c) transfers don't end up siloed on a free-tier personal account. Transfers the user authored *outside* the team scope (tagged `team: null`) stay with them. The activity feed annotates the removal event with the reassignment count.

<!-- - [ ] **"Leave team" flow for members.** Members can be removed by an Owner but have no self-service way to leave. Add `POST /api/team/leave`. Block the Owner from leaving until ownership is transferred. -->

<!-- - [ ] **Owner transfer.** Owner is currently immutable — if they get hit by a bus the team is stuck. Add an "Transfer ownership" action (Owner-only, confirmation required, target must be an existing ADMIN or MEMBER). -->

<!-- - [ ] **Email validation on invite.** `api/team/invite/route.js` doesn't validate the email format — typos create un-redeemable invites. Add a simple regex/`z.string().email()` check. -->

- [x] **Invite re-send / reminder.** Added a "Resend invite" action in the pending-invite dropdown — reuses `POST /api/team/invite`, which already upserts on `(team, email)`: regenerates the token, resets the 7d TTL, and re-sends the email. Skipped the optional reminder email at day 3/6.

- [x] **Block invite if user already on another team / has live sub.** Both routes check this. Creation: [api/team/invite/route.js:48-58](next/src/app/api/team/invite/route.js#L48-L58). Acceptance re-checks at accept time in [api/invite/[token]/route.js:74-82](next/src/app/api/invite/[token]/route.js#L74-L82).

- [x] **Surface remaining seats in the UI.** [MembersSection](next/src/app/(app)/app/(admin)/admin/sections/MembersSection.js) shows `X/Y seats used · N pending · M available`. [AddUserButton](next/src/app/(app)/app/(admin)/admin/AddUserButton.js) shows an at-capacity hint before submit and pivots to the prorated-cost confirm step when full. The accept-invite path auto-purchases a seat if capacity was eroded since send (already-done), so the invitee doesn't need a warning. New [CapacityBanner](next/src/app/(app)/app/(admin)/admin/CapacityBanner.js) sits at the top of every admin page when `members > seats` (rare, but possible after a Stripe-side downgrade) and links Owners straight to billing.

- [x] **Auto-purchase a seat when inviting over capacity.** Added server helper `teamSeats.js` (`previewSeatPurchase` / `purchaseSeats`) that calls `stripe.subscriptions.update` with `proration_behavior: "always_invoice"` and persists `team.seats` immediately (the webhook continues to sync as a safety net, gated to monotonic-increase to avoid stale rollbacks). `POST /api/team/invite` accepts `autoPurchaseSeat: true`; without the flag it returns `{ code: "SEATS_FULL" }`. New `POST /api/team/seats/preview` returns prorated `amountDue` + target quantity for the dialog. `AddUserButton` now renders a confirm step showing "X additional seat / Due now (prorated) / new quantity" before firing. Acceptance route auto-purchases too if capacity got eroded between send and accept (Stripe downgrade etc). All invitee-eligibility checks moved BEFORE the seat purchase so we don't charge then bail. New `TEAM_EVENT.SEAT_PURCHASED` for the activity feed.

### Billing & lifecycle
- [x] **Seat downgrade handling.** Grace state, not a hard block. Stripe portal config would be the cleaner enforcement layer but it's an out-of-band setup; the in-app fix detects the reduction in the webhook ([api/stripe/webhook/route.js](next/src/app/api/stripe/webhook/route.js)), persists the new `team.seats`, logs a `SEAT_REDUCED` activity event, and emails the Owner via the new `TeamOverCapacityEmail` template if `members > seats`. The persistent `CapacityBanner` keeps it visible in-app until resolved. New invites are blocked by the existing seat enforcement, so the team naturally rebalances as members leave (or the Owner adds seats back via the inline button below).

- [x] **Subscription cancellation: members keep team link.** `handleSubscriptionDeleted` now disbands the team on cancel: expires all team transfers, unsets `User.team` and resets `User.role` to OWNER for each member, deletes `Session`s so open tabs reload as solo accounts, and drops the `Team`/`TeamInvite`/`TeamEvent` documents. The Stripe customer record stays so the previous owner can re-subscribe cleanly. Tests for the user-side branch unchanged; the team-side path uses targeted `updateMany`s instead of the old per-doc loop.

- [x] **Seat count in checkout vs. real headcount.** Inline [SeatManager](next/src/app/(app)/app/(admin)/admin/SeatManager.js) on `/app/admin/billing`. Owner-only, with a stepper bounded by `max(minSeats, members + pendingInvites)` (floor) and `PLANS.teams.maxSeats` (ceiling). Increases reuse `purchaseSeats` (Stripe `proration_behavior: always_invoice`, monotonic-increase persist) and show a live prorated preview. Decreases use a new `setSeatCount` path with `proration_behavior: create_prorations` so credit lands on the next invoice. Both paths log a team event. `PUT /api/team/seats` returns a `SEATS_OCCUPIED` code if the target dips below current usage.

### Permissions & visibility
- [x] **Members are locked out of `/app/admin`.** New read-only [/app/team page](next/src/app/(app)/app/(dashboard)/team/page.js) for Member-role users (Owner/Admin redirect into `/app/admin`). Shows plan name, role, and the full member list with role badges and a "(you)" marker. [FloatingBar](next/src/app/(app)/app/FloatingBar.js) shows a "Team" nav item for members and the existing "Admin" item for Owner/Admin. "Leave team" intentionally not shipped — the API for it is still out-of-scope per the commented-out item below; trust is solved by visibility alone.

<!-- - [ ] **Settings page shows nothing for team users.** `SettingsPage.js:131` hides the plan card when `user.hasTeam` is true but never renders a team-aware replacement. Show: team name, role, plan, "manage team" link (Owner/Admin) or "leave team" (Member). -->

- [x] **User has no name field.** `User.fullName` already existed and is set on invite acceptance ([InviteAcceptForm.js](next/src/app/(fullscreen)/invite/[token]/InviteAcceptForm.js)). Added inline edit in [SettingsPage.js](next/src/app/(app)/app/(dashboard)/settings/SettingsPage.js) backed by `PUT /api/user/settings` (80-char cap; empty clears). Invite email now greets with `inviterName` (fullName → email fallback) instead of raw email. Team member list already uses `fullName || email`. Skipped collecting it on magic-link signup to avoid friction.

### Notifications
- [x] **Transactional emails for team events.** Templates in [mail/templates/](next/src/lib/server/mail/templates/) — `TeamInviteAcceptedEmail`, `TeamMemberRemovedEmail`, `TeamRoleChangedEmail`, `TeamSeatCapacityReachedEmail` — wired up fire-and-forget from the invite acceptance route and the user DELETE/PUT routes. Seat-capacity email fires when the last seat fills on accept.

<!-- - [ ] **Cancellation / expiry warning email.** When subscription is cancelled or about to lapse, email all team members so they don't lose access without warning. -->

## 🟢 Polish & nice-to-haves

- [x] **Typo: "Deletetion failed"** — gone, the team UserList now lives at [app/(admin)/admin/UserList.js](next/src/app/(app)/app/(admin)/admin/UserList.js) and the catch surfaces `err.message` directly.

- [x] **Team name editing.** Inline edit on the overview page header via [TeamNameEditor](next/src/app/(app)/app/(admin)/admin/TeamNameEditor.js) (Owner/Admin only, Member sees plain title). Backed by `PUT /api/team` ([api/team/route.js](next/src/app/api/team/route.js)) with a 1-60 char guard; logs a `TEAM_RENAMED` activity event with the from/to values.

- [x] **API error handling.** [Api.js](next/src/lib/client/Api.js) now has a single `parseResponse` helper and an `ApiError` class that carries `code` and `status`. Both `get` and `withBody` go through it — no more duplicated branches, no `"unknown error"` strings unless the server genuinely returned nothing. The `code` field (e.g. `SEATS_FULL`, `SEATS_OCCUPIED`) is preserved on the thrown error so callers can branch without sniffing message text.

- [x] **Better empty/loading states** on the admin views. [MembersSection](next/src/app/(app)/app/(admin)/admin/sections/MembersSection.js) shows an explicit "You're the only one here" empty state when the Owner is the only seat filled and no invites are pending. The seat-usage line now says `· N available` so the affordance to invite is visible at a glance. UserList rows show `(you)` next to the current user. Existing empty states on `/app/admin/transfers`, `/app/admin/activity`, and the branding shell already had good copy.

- [x] **Per-user transfer count + drill-in on the team user list (Owner-only).** Members page runs a `Transfer.aggregate([{$match: {team, expiresAt > now}}, {$group: {author, count}}])` and threads `activeTransferCount` into each UserList row. The pill renders only when `currentUser.role === OWNER && count > 0`, and links to `/app/admin/transfers?author=USER_ID`. [TransfersSection](next/src/app/(app)/app/(admin)/admin/sections/TransfersSection.js) reads the query string via `useSearchParams` to seed the author filter on mount.

<!-- - [ ] **Lightweight team activity feed.** Not a compliance audit log — just an in-app list: "Alice invited bob@…", "Bob joined", "Charlie was made Admin", "Dana left." Gives Owners visibility without building enterprise tooling. Single `TeamEvent` collection, capped TTL. -->

<!-- - [ ] **Team-level usage summary.** On `/app/team`: total transfers this month, total storage used (once pooled storage lands), top senders. Not a full analytics dashboard — one card. -->

---

## Explicitly out of scope (for now)

- SSO / SAML / OIDC / SCIM — enterprise tier, not needed for WeTransfer-style teams
- Free team tier — keep min 2 paid seats
- Fine-grained custom roles / per-resource ACLs — Owner/Admin/Member is enough
- Compliance audit exports / SOC2 trail — the activity feed above is sufficient for now
