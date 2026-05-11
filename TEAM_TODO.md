# Team Feature — Production TODO

Scope: ship a credible WeTransfer-style team plan. Owners/Admins manage seats and invites; team members share branding; only the Owner can inspect other members' transfers; billing reflects reality. Skipping enterprise-only stuff (SSO/SAML/LDAP, audit-trail compliance exports) — not the bar we're shooting for yet.

Legend: 🔴 blocks production · 🟠 broken core team value · 🟡 needs to work before launch · 🟢 polish

---

## 🔴 Critical bugs — broken right now

- [x] **`deleteUser` API call is broken.** `next/src/lib/client/Api.js:143` calls `del(...)` which doesn't exist (only `withBody` is exported). Removing a team member from the UI throws `ReferenceError`. Change to `withBody("delete", \`/team/users/${userId}\`)`.

- [x] **Stripe seat quantity never persists to `Team.seats`.** `next/src/app/api/stripe/webhook/route.js:74` reads `const seats = item.quantity` but `handleSubscription` never writes it. `Team.seats` only reflects what was set at checkout — any seat upgrade/downgrade in Stripe is silently ignored. Pass `seats` through `updateSubscription({...})` and persist it on the Team model.

- [x] **No seat enforcement.** Neither `POST /api/team/invite` (`route.js`) nor `POST /api/invite/[token]` checks `team.users.length + pendingInvites < team.seats`. Owners can invite unlimited members regardless of paid quantity. Add a guard in both routes, and ideally surface remaining seats in the UI.

- [x] **Sessions not invalidated on member removal.** `api/team/users/[userId]/route.js` `$pull`s the user and unsets `team`, but their session cookie is still valid until expiry — they continue to act as a logged-in user with stale team context cached. Delete the user's sessions on removal.

- [ ] **Pending-owner promotion is race-prone.** `api/stripe/webhook/route.js:84-92` (with its own `TODO`) decides "this is the owner" by checking `users.length === 0`. Two near-simultaneous webhook deliveries, a manually-added user, or a retry can leave the team owner-less or with the wrong owner. Use the `pendingOwner` field as the authoritative source and clear it atomically.

## 🟠 Core team value is missing

These are the things that make "team plan" actually mean something. Today the feature is effectively "shared billing".

- [ ] **Transfers are not team-scoped.** `Transfer.author` is a single user; `listTransfersForUser` only returns the caller's own. The Owner can't see, manage, or hand off other members' transfers. Decide & implement: add `Transfer.team` (denormalized at creation), and let the Owner *view*, delete, or extend any team member's transfer. Members should only see their own transfers — no cross-member visibility.

- [ ] **BrandProfile is per-user, not per-team.** `BrandProfile.author` is a single user. Team members can't share or apply company branding. Add `team` on BrandProfile, scope the editor + picker by team when the user has one.

- [ ] **TransferRequest (request links) is per-user.** Same problem — `TransferRequest.author` is a single user. A teammate can't pick up incoming files when the requester is OOO. Add team scoping or at minimum a "team request link" mode.

- [x] **Storage limits are ambiguous and probably wrong.** ~~Pricing says 500GB *per seat* but `User.getStorage()` just calls `getMaxStorageForPlan(this.getPlan())` — each member independently gets 500GB regardless of seat count.~~ Bumped Teams plan storage to **1TB per seat, each user gets 1TB independently** (no aggregation). At 1TB per member this will never realistically be hit, so pooled storage isn't worth building.

- [ ] **Custom domains are stubbed.** `BrandProfile.js:20` has `// TODO: custom domains` and the `domain` field is commented out, yet the Teams plan markets `CUSTOM_DOMAIN`. Either ship it (DNS verification, cert via Caddy, routing in `next.config.js`) or remove from the plan features.

## 🟡 Needs to work before launch

### Membership lifecycle
- [ ] **Transfer ownership on member exit.** Today when a member is removed (or leaves), their transfers stay tied to them but they're now outside the team. Define: reassign to team Owner? Keep but mark orphaned? Force deletion with grace window? Implement the chosen policy in the DELETE user route and the "leave team" flow.

- [ ] **"Leave team" flow for members.** Members can be removed by an Owner but have no self-service way to leave. Add `POST /api/team/leave`. Block the Owner from leaving until ownership is transferred.

- [ ] **Owner transfer.** Owner is currently immutable — if they get hit by a bus the team is stuck. Add an "Transfer ownership" action (Owner-only, confirmation required, target must be an existing ADMIN or MEMBER).

- [ ] **Email validation on invite.** `api/team/invite/route.js` doesn't validate the email format — typos create un-redeemable invites. Add a simple regex/`z.string().email()` check.

- [x] **Invite re-send / reminder.** Added a "Resend invite" action in the pending-invite dropdown — reuses `POST /api/team/invite`, which already upserts on `(team, email)`: regenerates the token, resets the 7d TTL, and re-sends the email. Skipped the optional reminder email at day 3/6.

- [ ] **Block invite if user already on another team / has live sub.** The invite *creation* route checks this (good), but the invite *acceptance* should re-check at accept time too — the invitee's state may have changed between send and accept.

- [ ] **Surface remaining seats in the UI.** Seat enforcement now blocks invites server-side, but the invite UI gives no warning until the request fails. Disable / hint when full. Same on the accept-invite page if the team has filled up since send. We should upsell, asking if they want to pay for more seats.

- [ ] **Auto-purchase a seat when inviting over capacity.** If an Owner/Admin invites a new member and the team is at seat capacity, automatically increment the Stripe subscription quantity by 1 (prorated) instead of rejecting the invite. Show a clear confirmation in the invite UI ("This will add 1 seat at $X/mo, prorated") before firing. Persist the new `seats` count via the existing webhook path. Same behavior on invite acceptance if capacity was filled between send and accept.

### Billing & lifecycle
- [ ] **Seat downgrade handling.** If the Owner reduces seats in Stripe from 10→5 but the team has 8 members, today nothing happens — they're over capacity silently. Decide policy: block the downgrade via portal config (preferred), or enter a grace state and notify Owner to remove N members before next renewal.

- [ ] **Subscription cancellation: members keep team link.** `handleSubscriptionDeleted` expires transfers but leaves `User.team` set and `User.role` intact on every member. After cancellation the team is in a zombie state (no plan, but members are still "in a team", `hasTeam` is true, settings UI breaks). Either clear team membership on cancel, or render an explicit "expired team" state and gate functionality.

- [ ] **Plan fields scattered on Team/User.** Both `Team.js:10` and `User.js:51` carry the same `TODO: Fix plan shit into an object`. Plan/status/validUntil/cancelling/interval live as five top-level fields. Roll into a single `subscription: { plan, status, validUntil, cancelling, interval, seats }` subdoc — much easier to reason about and avoids drift between Team and User code paths.

- [ ] **Seat count in checkout vs. real headcount.** When creating a team via checkout the Owner picks `seats`, but there's no UI later to *change* seats from inside the app (they have to go to Stripe portal). Add an inline seat-update button in `/app/team` that calls Stripe to update quantity.

### Permissions & visibility
- [ ] **Members are locked out of `/app/team`.** `app/team/page.js:13` redirects non-admin members away. Show them a read-only team page: who's on the team, plan name, "leave team" button. Critical for trust ("am I really on this team?").

- [ ] **Settings page shows nothing for team users.** `SettingsPage.js:131` hides the plan card when `user.hasTeam` is true but never renders a team-aware replacement. Show: team name, role, plan, "manage team" link (Owner/Admin) or "leave team" (Member).

- [ ] **User has no name field.** `team/page.js:24` falls back to `email.split("@")[0]` for `fullName`. Add `User.name` (optional), let users set it on signup / in settings, and use it in the team member list, invite emails, and brand-profile defaults.

### Notifications
- [ ] **Transactional emails for team events.** Minimum set: invite sent (exists), invite accepted (notify Owner), member removed (notify the removed user), role changed (notify the affected user), seat capacity reached (notify Owner). Pretty self-explanatory and expected behavior.

- [ ] **Cancellation / expiry warning email.** When subscription is cancelled or about to lapse, email all team members so they don't lose access without warning.

## 🟢 Polish & nice-to-haves

- [ ] **Typo: "Deletetion failed"** in `next/src/app/(app)/app/team/UserList.js:110`.

- [ ] **Team name editing.** Name is set at team creation and never shown editable in UI. Add a rename action in `/app/team` (Owner/Admin).

- [ ] **API error handling.** `Api.js:10,42` flagged as ugly. Standardise so client-side surfaces the actual server message instead of "unknown error" — especially relevant for invite/seat errors users will hit.

- [ ] **Better empty/loading states** on `/app/team` (no invites yet, no members beyond owner, etc.).

- [ ] **Per-user transfer count + drill-in on the team user list (Owner-only).** For the Owner, each row in `/app/team`'s user list should show the member's active transfer count (omit if 0) and a button to view that member's transfers. Admins and Members should not see this. Depends on team-scoped transfer visibility (see 🟠 "Transfers are not team-scoped").

- [ ] **Lightweight team activity feed.** Not a compliance audit log — just an in-app list: "Alice invited bob@…", "Bob joined", "Charlie was made Admin", "Dana left." Gives Owners visibility without building enterprise tooling. Single `TeamEvent` collection, capped TTL.

- [ ] **Team-level usage summary.** On `/app/team`: total transfers this month, total storage used (once pooled storage lands), top senders. Not a full analytics dashboard — one card.

---

## Explicitly out of scope (for now)

- SSO / SAML / OIDC / SCIM — enterprise tier, not needed for WeTransfer-style teams
- Free team tier — keep min 2 paid seats
- Fine-grained custom roles / per-resource ACLs — Owner/Admin/Member is enough
- Compliance audit exports / SOC2 trail — the activity feed above is sufficient for now
