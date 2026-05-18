# Security audit — `teams` branch

Author: Claude (security review pass)
Scope: `origin/production` ↔ `origin/teams` diff (~11K lines changed)
Date: 2026-05-17

This document lists **5 verified CRITICAL vulnerabilities** in the `teams` branch,
plus a set of HIGH / MEDIUM issues worth fixing before launch. Every CRITICAL has
been read at the source twice, the threat model traced end-to-end, and the
production branch checked to confirm whether it is a regression or a pre-existing
issue.

Recommendation: **do not ship this branch to paying tenants until the five
CRITICAL findings below are fixed.** Two of them allow any regular team member
to either drain or destroy the team's billing relationship. One allows
cross-tenant data leakage of files uploaded externally. One allows account
takeover via invite-token interception. One leaks the Stripe webhook secret
into application logs.

---

## CRITICAL #1 — Any team member can open the Stripe Customer Portal for the team's billing account

**File:** `next/src/app/api/stripe/create-customer-portal-session/route.js:13`

**Status:** New in `teams` branch (production used `user.stripe_customer_id` unconditionally).

### What's wrong

```js
export async function POST() {
  const auth = await useServerAuth()
  if (!auth) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 })
  }
  const { user } = auth

  const stripe_customer_id = user.hasTeam ? user.team.stripe_customer_id : user.stripe_customer_id
  // ...
  const session = await getStripe().billingPortal.sessions.create({
    customer: stripe_customer_id,
    return_url: `${process.env.SITE_URL}/app/settings`
  })
  return NextResponse.redirect(session.url, { status: 303 })
}
```

The endpoint only checks that a session exists (`useServerAuth`). There is **no
role gate** — a regular `MEMBER` of a team passes the auth check, and the
handler then hands them a Stripe Customer Portal URL for the *team's* customer.

The dashboard UI hides the "Cancel or Manage Billing" button for team users
(`SettingsPage.js:201` guards on `!user.hasTeam`, and `BillingSection.js` only
renders inside the Owner-only `/app/admin/billing` page at
`billing/page.js:14`). The UI gate is the only line of defense; the API
endpoint has none.

### Impact

Any team Member can, with one `curl`:

```
curl -X POST -H 'Cookie: token=<member-session>' \
  https://transfer.zip/api/stripe/create-customer-portal-session -L
```

…and reach a fully-privileged Stripe portal session for the *team's* Stripe
customer. Stripe's default portal config lets the user:

- **Cancel the subscription** → fires `customer.subscription.deleted` →
  `handleSubscriptionDeleted` in `api/stripe/webhook/route.js:172` runs and
  *disbands the entire team*:
  - all team transfers are forced to `expiresAt: now` (line 205)
  - team-scoped brand profiles are reassigned to the (former) Owner (line 216)
  - every team user's `team` is unset and `role` reset to OWNER (line 226)
  - every team user's session is deleted (line 233)
  - the `Team`, `TeamInvite`, and `TeamEvent` rows are dropped (lines 237–239)
- Update / remove the saved payment method (and add a new card that becomes
  default for future renewals).
- View the entire billing history and invoices.

So a single disgruntled Member can permanently destroy an entire paying tenant's
team workspace, force-cancel their billing, and walk away. The Owner gets no
multi-factor prompt or confirmation — the portal session is already authenticated
on the team's behalf.

### Fix

Gate by role. Owners-only is consistent with how `/app/admin/billing/page.js`
gates the UI (`if (user.role !== ROLES.OWNER) redirect("/app/admin")`):

```js
if (user.hasTeam && user.role !== ROLES.OWNER) {
  return NextResponse.json(resp("Forbidden"), { status: 403 })
}
```

---

## CRITICAL #2 — Any team member can create new Stripe subscriptions billed to the team's Stripe customer

**File:** `next/src/app/api/stripe/create-checkout-session/route.js:56-117`

**Status:** New in `teams` branch (production checkout was per-user only).

### What's wrong

```js
if (plan.isTeamPlan) {
  if (!user.hasTeam) {
    // ... create new team with pendingOwner = user
    subscriber = team
  }
  else {
    subscriber = user.team        // <-- *** no role check ***
  }
}
else {
  subscriber = user
}

let existingCustomerId = subscriber.stripe_customer_id   // team's customer
// ...
const session = await stripe.checkout.sessions.create({
  line_items: [{ price: priceId, quantity: seats }],
  mode: "subscription",
  customer: existingCustomerId,                          // team's customer
  // ...
});
return NextResponse.json(resp({ url: session.url }))
```

When `tier === "teams"` and the calling user has a team, the route uses the
**team's** `stripe_customer_id` and creates a brand-new Stripe Checkout session
against that customer — regardless of whether the caller is `OWNER`, `ADMIN`,
or `MEMBER`. The body is fully controllable (`seats` is bounded only by the
plan's `minSeats..maxSeats`, i.e. 2..25).

### Impact

A Member can:

1. POST `/api/stripe/create-checkout-session` with
   `{ tier: "teams", frequency: "monthly", teamInfo: { seats: 25 } }`.
2. Open the returned `session.url`. Stripe Checkout for an existing customer
   prefills the team's saved payment method — the Member just clicks "Pay"
   and the **team Owner's saved card is charged** for an additional
   $250–$375 / month subscription.
3. The webhook (`api/stripe/webhook/route.js:73-112`, `handleSubscription`)
   then runs against the team document and unconditionally overwrites
   team state with the **new** subscription's metadata, *not* the original:
   ```js
   subscriber.updateSubscription({ plan: ..., status, validUntil, cancelling, interval })
   // ...
   subscriber.seats = seats              // OVERWRITES with new sub's quantity
   ```
   The team's `seats` field is *replaced* with the new sub's quantity. If the
   original had 10 seats and the Member's new sub has 2, the team now claims
   2 seats in the DB. Five existing members are suddenly over capacity:
   - the Owner gets a "team over capacity" email (`webhook/route.js:124-138`),
   - new invites are blocked (`team/invite/route.js:62`),
   - Stripe is happily billing for two overlapping subscriptions (10 seats +
     2 seats) on the same customer.

A Member can also add a **new card** during checkout, which becomes the team
customer's default payment method for all future renewals — quietly hijacking
the billing relationship.

### Fix

Same shape as #1: refuse for non-owners.

```js
if (user.hasTeam && user.role !== ROLES.OWNER) {
  return NextResponse.json(resp("Forbidden"), { status: 403 })
}
```

Also worth doing: when handling `customer.subscription.created` for a team
that *already* has an active subscription, refuse the new one and cancel it
on the Stripe side — never two live team subscriptions on the same customer.

---

## CRITICAL #3 — Cross-tenant data leak: files uploaded by a team member to *anyone else's* transfer-request link become visible to the member's team admins

**File:** `next/src/app/api/transfer/new/route.js:179-191`

**Status:** New in `teams` branch (production had no `Transfer.team` field).

### What's wrong

`/api/transfer/new` is the single entry point for all uploads — authenticated
"send a file" actions *and* guest-style uploads against a `TransferRequest`
secret code. The branch added a `Transfer.team` field denormalized at
creation:

```js
const transfer = new Transfer({
  transferRequest: transferRequest ? transferRequest._id : undefined,
  author: auth ? auth.user._id : undefined,
  team: auth?.user?.team?._id,           // <-- ALWAYS set if user is on a team
  // ...
})
```

`team` is set from `auth.user.team` **unconditionally** — even when
`transferRequest` is set, i.e. when the upload is going to *somebody else's*
inbox via *their* request link.

The team admin transfers list (`api/team/transfers/route.js` →
`listTransfersForTeam` in `lib/server/serverUtils.js:53`) selects on the
denormalized field:

```js
return Transfer.find({ team: team._id })
  .populate("author", "email fullName")
  .sort({ createdAt: -1 })
```

…and the admin page renders these with `toJsonAsTeamAdmin()`
(`models/Transfer.js:167-193`), which exposes `secretCode`, file list with
names and sizes, `nodeUrl`, and the author's email/full name.

### Impact (concrete scenario)

Alice is a marketing-agency employee whose company uses the Teams plan
(TeamA). Alice's personal lawyer sends her a Transfer.zip request link
(`/upload/<secret>`) asking her to upload her divorce paperwork. Alice
clicks it while signed in to TeamA in another tab and uploads the file.

What happens server-side:

- `TransferRequest.findOne({ secretCode })` finds the lawyer's request — fine.
- `new Transfer({ transferRequest: <lawyer's>, author: alice, team: TeamA,
  ... })` is saved.
- TeamA's owner / admins now see the upload under **/app/admin/transfers**
  with:
  - file names (e.g. `divorce_settlement_draft_v3.pdf`),
  - file sizes,
  - `secretCode` (i.e. a working download URL),
  - Alice's email as the uploader.

They can **download Alice's divorce paperwork** with one click. Alice never
intended this — the request link belongs to her lawyer, not the company.

The same exposure applies to any team member's personal uploads via any
external party's request link: medical records to a doctor, financial
documents to an accountant, anything to a personal counterparty.

### Verification

A team admin viewing `/app/admin/transfers` calls
`GET /api/team/transfers` (`api/team/transfers/route.js:6`) which goes
through `useTeamAdminAuth` (allowed for Owner + Admin), then runs
`listTransfersForTeam(admin.team)` and returns the secretCodes. The
secretCode alone is sufficient to download via the public
`/transfer/[secretCode]` page (no auth on that page — see
`(site)/(downloadupload)/transfer/[secretCode]/page.js`).

### Fix

Only tag with the team when the transfer is *being created on the team's
behalf*, i.e. when the upload is **not** going into someone else's request.
The simplest gate:

```js
team: (auth && !transferRequest) ? auth.user.team?._id : undefined,
```

Or, more defensively, set `transfer.team = auth.user.team._id` only when the
uploader **also owns the `transferRequest`** (or there is no request at all,
which is the "I'm sending a fresh transfer" path). Anything destined for a
counterparty's request link is the member's personal business.

(For an even tighter fix, also strip / refuse the `team` denormalization for
guest uploads to *team-owned* requests where the guest happens to be on a
*different* team — the request belongs to the request author's team, not the
guest's.)

---

## CRITICAL #4 — Invite token bypasses password authentication, silently taking over the invitee's existing account

**File:** `next/src/app/api/invite/[token]/route.js:41-99`

**Status:** New in `teams` branch (no invite acceptance path existed before).

### What's wrong

```js
export async function POST(req, { params }) {
  // ...
  const invite = await TeamInvite.findOne({ token: { $eq: token } })
  // ...
  const auth = await useServerAuth()
  let user
  let mintNewSession = true

  if (auth && auth.user.email === invite.email) {
    user = auth.user
    mintNewSession = false
  } else {
    const existingUser = await User.findOne({ email: { $eq: invite.email } })
    if (existingUser) {
      user = existingUser                  // <-- attach to an EXISTING account
      if (fullName && !existingUser.fullName) {
        existingUser.fullName = fullName
        await existingUser.save()
      }
    } else {
      user = new User({ email: invite.email })
      // ...
    }
  }

  await redeemTeamInviteForUser(invite, user)
  // ...
  if (mintNewSession) {
    const session = new Session({ user: user._id })
    await session.save()
    response.cookies.set("token", session.token, createCookieParams())
  }
}
```

When the caller is not signed in as the invitee, the route looks up the
**existing** `User` matching `invite.email` (or creates one) and **mints a
new session cookie for that user**, regardless of whether the caller has any
authentication tied to that mailbox.

The comment above the function explicitly endorses this design: *"the invite
token is the proof: it was delivered to the invite.email inbox, so anyone
holding it has demonstrated control over that mailbox."* That's a defensible
model in the abstract — but the current implementation has three concrete
properties that make it dangerous:

1. **The invite token alone is sufficient — no verification challenge.**
   Anyone in possession of the token (without ever proving access to the
   mailbox) can mint a session for the existing user. The link being in an
   email is *the* assumption, but tokens leak: forwarded emails, shared
   inboxes, screenshots, link previews in chat services, browser history on
   a shared computer, the recipient pasting "look at this weird email"
   into a Slack channel.

2. **The legitimate user's existing sessions are NOT invalidated** when the
   takeover session is minted (no `Session.deleteMany({ user: user._id })`
   anywhere on this path). The attacker gets a parallel session next to the
   victim's. The victim has no signal that anything happened, and the
   attacker's session persists until they choose to log out.

3. **No `fullName` collision protection.** If the attacker passes a
   `fullName` and the victim's existing account has none, line 71-73
   silently sets it — *to whatever the attacker chose*. The next time the
   victim signs in legitimately their account claims to be "John H4cker."

This is worse than the equivalent password-reset attack because:

- A password reset would invalidate other sessions and force the victim to
  notice (their password no longer works).
- A password reset usually requires the attacker to *also* set a new
  password (changing the credential the victim knows).
- The invite path is **silent** — both the attacker and the victim can use
  the account simultaneously.

The prerequisite is that *someone* sends an invite to the victim's email
address. That's trivial: an attacker who is an admin of *any* team on
the platform (including a free 2-seat trial team they created themselves)
can invite arbitrary email addresses. The invite endpoint
(`api/team/invite/route.js:25-31`) does no email-format validation, no
captcha, no rate limit — and `/api/team/invite/route.js:44` only blocks the
invite if the *target* user is already in another team. An attacker can
just spray invites to lists of high-value email addresses and wait for any
one of them to either click the link in their inbox, or have the link
intercepted by a corporate email-forwarder / safelinks rewriter / shared
mailbox.

### Impact

Silent persistent account takeover of any existing transfer.zip account
whose owner clicks (or whose mailbox leaks) an invite link addressed to
them. The legitimate user is also *forced into a team they did not choose
to join*, and any team-tagged transfers they create after that point
become visible to the attacker's team admin (compounding with #3).

### Fix

Pick one (in order of preference):

1. **Require explicit authentication before accepting an invite that maps
   to an existing user.** If `existingUser` is found and the caller is not
   already signed in as them, return a "sign in to accept" challenge —
   send a magic link to `invite.email` and only accept the invite after
   the magic-link session is established. The invite token then becomes a
   *one-time confirmation* layered on top of mailbox proof, not a bearer
   credential.
2. At minimum, when minting the takeover session, **delete all other
   sessions for that user** (`await Session.deleteMany({ user: user._id })`).
   This forces a notice signal (the victim is logged out everywhere) and
   prevents persistent parallel access.
3. Stop the silent `fullName` write — never modify an existing user's
   profile fields from an invite acceptance.

---

## CRITICAL #5 — Stripe webhook signing secret is `console.log`'d to application logs on signature-verification failure

**File:** `next/src/app/api/stripe/webhook/route.js:37-42`

**Status:** Pre-existing in production (not a teams-branch regression), but
unchanged in this branch and worth fixing now since the Teams feature *adds
new attack value* to a forged webhook event (mass plan upgrades for free,
arbitrary seat counts, team-state overwrites — see #2).

### What's wrong

```js
try {
  event = getStripe().webhooks.constructEvent(payload, sig, process.env.STRIPE_WHSEC);
} catch (err) {
  console.error("Error verifying webhook signature:", err);
  console.log(process.env.STRIPE_WHSEC)       // <-- secret printed in clear
  return NextResponse.json(resp(`Webhook Error: ${err.message}`), { status: 500 })
}
```

The Stripe webhook secret (`STRIPE_WHSEC`) is the **only** thing protecting
the `handleSubscription*` handlers from forged events. The branch prints it
into the log stream on every signature-verification failure — and an
attacker can *trigger* signature failures at will simply by posting any
non-Stripe payload to `/api/stripe/webhook`.

Consequence:

- Anyone with read access to application logs (developers, observability
  vendors, third-party log shippers, anyone who breaches a logging service)
  extracts the webhook secret.
- With that secret, an attacker can craft signed events posting to
  `/api/stripe/webhook`. The handler accepts them as authentic and:
  - sets `team.plan`, `team.planStatus`, `team.planValidUntil` to anything
    a forged event payload claims (`handleSubscription` →
    `subscriber.updateSubscription({...})`),
  - sets `team.seats` to anything (`subscriber.seats = seats` at line 99),
  - on a forged `customer.subscription.deleted` for any real team's customer
    ID, **disbands the team** (deletes all team data, expires all transfers,
    invalidates all sessions — see #1 for what dissolution does),
  - on a forged `customer.subscription.created` for a real team where
    `users.length === 0` (a stale `pendingOwner` team — these exist per
    `CLEANUP_TODO.md`), **adds the pending owner to the team as Owner**.

### Impact

Total compromise of the team-billing state, conditional on log-store access.
For a hosted environment that ships logs to a SaaS vendor (Datadog, Logtail,
Sentry, Vercel, etc.), the secret is effectively shared with every employee
of that vendor and every system in the log pipeline.

### Fix

Trivially: delete that one line.

```js
} catch (err) {
  console.error("Error verifying webhook signature:", err);
  return NextResponse.json(resp(`Webhook Error: ${err.message}`), { status: 500 })
}
```

While you're there, rotate `STRIPE_WHSEC` in Stripe (Dashboard → Developers
→ Webhooks → reveal/rotate) — assume the current value is already in your
historical log retention.

---

# Other notable issues (HIGH / MEDIUM)

These didn't reach the bar for CRITICAL but should be triaged before
launching the Teams plan to paying companies. They are listed in rough
descending order of impact.

### HIGH — `Transfer.team` is set for guest-uploads to *team-owned* requests too

`api/transfer/new/route.js:182` sets `team` from the **uploader's** team. If
the uploader is on a *different* team than the request owner, the file is
visible to the *uploader's* team admin and *invisible* to the request
owner's team admin — even though the request was created by the latter.

A consistent fix: when there's a `transferRequest`, denormalize
`transfer.team` from `transferRequest.author.team` (the request owner's
team at upload time), not from the uploader's team. Even better: introduce
`TransferRequest.team` (denormalized at request creation) and use that —
this is also called out as missing in `TEAM_TODO.md`.

### HIGH — Admin can drain the team owner's card via invite + revoke cycles

`api/team/invite/route.js` accepts `autoPurchaseSeat: true`. Each invite
that auto-purchases a seat calls `purchaseSeats` (`lib/server/teamSeats.js:59`)
which monotonically bumps `team.seats` and *updates the Stripe subscription
to bill immediately* (`proration_behavior: "always_invoice"`). The DELETE
handler at line 110 lets the same Admin then *revoke* the invite — but
seat count is **not decremented** on revoke. Repeat in a loop.

A compromised Admin (or a malicious one) can run this in a tight loop for
the duration of an `expires_at`-bounded checkout — about 22 hours — adding
seats up to `PLANS.teams.maxSeats = 25`, then the loop stops mattering
because the cap is reached. So the cap *is* a control, but the Admin can
still run the team to its plan ceiling repeatedly across the billing
cycle, and the prorations stack. (Recommendation: charge proration on
*net* change at end-of-period, not per-invite, or require Owner approval
above some delta.)

### HIGH — `Transfer.findById(transferId)` in `/api/transfer/[transferId]/delete/route.js:19` crashes on guest-uploaded transfers

```js
const transfer = await Transfer.findById(transferId).populate('transferRequest');
const authorized =
  transfer &&
  (transfer.author.equals(user._id) ||                       // <-- TypeError
    (transfer.transferRequest &&
      transfer.transferRequest.author.equals(user._id)));
```

`transfer.author` can be `null` for guest uploads (see `transfer/new/route.js:181`
where `author: auth ? auth.user._id : undefined`). Calling `.equals()` on
`null` throws, which the route surfaces as 500 to the caller. Not directly a
security issue, but a reliability bug along an authorisation path is worth
noting.

### MEDIUM — `BrandProfile.PUT` silently destroys the icon/background when the client sends only `{ name }`

`api/brandprofile/[brandProfileId]/route.js:23-31` unconditionally calls
`processAndUploadBrandProfileImages({ iconUrl, backgroundUrl, ... })`. When
those fields are missing from the request body, `brandProfileUtils.js:132-135`
treats `undefined` as "user wants the image removed" and **issues a
`DeleteObjectCommand` to S3**, then clears the DB field. Any API client that
isn't the existing editor (or any future editor that does optimistic /
partial updates) loses both images on a name-only edit. Guard with
`iconUrl !== undefined` before treating "no field present" as "delete the
asset."

### MEDIUM — `Session` documents never expire server-side

`models/Session.js` has no TTL index and no `expires` field. The auth cookie
expires after 100 days client-side (`serverUtils.js:28`) but the row stays
in MongoDB forever. A stolen `token` value (XSS in dev mode without
HTTPS, MITM, a forensic copy of cookie jars, an attacker who can read a
backup) remains valid indefinitely. Add a TTL index (`createdAt` +
`expireAfterSeconds`) matching or shorter than the cookie lifetime, or
rotate session tokens on a schedule.

### MEDIUM — `/api/auth/magic-link/by-request/[requestId]/verify` has no rate limit on code attempts

`api/auth/magic-link/by-request/[requestId]/verify/route.js` accepts up to
any number of incorrect 6-digit-code attempts inside the magic-link's 15
minute TTL. The attack model requires the attacker to also hold the
`mlReq` cookie (httpOnly) and know the `requestId` — so this is gated by
two other things — but adding a per-`requestId` counter with a small
threshold (5? 10?) costs nothing and removes any future "what if we
relax `mlReq`" footgun.

### MEDIUM — `TransferRequest.active` is checked nowhere on uploads

`api/transfer/new/route.js:75-83` looks up the `TransferRequest` purely by
`secretCode`. The `active` field — toggled by
`api/transferrequest/[transferRequestId]/{de,}activate/route.js` — has no
read site on the upload path. "Deactivate" gives Owner a false sense of
having closed the link; uploads continue to land. (Pre-existing in
production, not a teams-branch regression.)

### LOW — `/api/team/invite` DELETE accepts the invite id from the JSON body without `$eq`

`api/team/invite/route.js:127-129`:

```js
const { _id } = await req.json()
const invite = await TeamInvite.findOne({ _id, team: team._id })
```

A caller can pass `_id: { $ne: null }` and delete *some* invite for their
team. Constrained to the caller's own team (which they already have
delete authority over), so impact is limited to "can delete an invite
without knowing its id." Worth tightening with explicit `$eq`/string
validation regardless — this is the only spot in the team APIs that
doesn't follow the `$eq` discipline used in (e.g.)
`api/invite/[token]/route.js:52`.

### LOW — Webhook `handleSubscription` deref of `subscriber.pendingOwner._id` when `users.length === 0`

`api/stripe/webhook/route.js:103-108`. If `pendingOwner` is unset (a stale
team somehow lost it) but `users.length === 0`, the handler crashes on
`subscriber.pendingOwner._id`. Defensively `if (subscriber.pendingOwner)`
around the block, or fail fast with an explicit error. The
`TEAM_TODO.md` has a (commented-out) TODO for replacing this whole
"first user wins" heuristic with `pendingOwner` as the authoritative
source — agreed; do that.

### LOW — Email subjects interpolate `teamName` with only `.trim()` validation

`/api/team/route.js:17-24` only validates `name.length`. Newlines in the
middle survive. Subjects like
`` `${teamName} has reached its seat limit - …` `` flow into Resend's
SDK. Resend almost certainly sanitises but the safe thing to do at the
boundary is `name.replace(/[\r\n]+/g, " ")` on save.

---

## Pre-existing issues called out for completeness

- `/api/sign` does not enforce ownership on either upload or download paths
  (the route itself flags this — `next/src/app/api/sign/route.js:25`).
  Anyone with a `secretCode` can mint download tokens. This is the
  pre-existing "secretCode is the access token" model and not introduced by
  this branch, but combined with #3 it widens the blast radius (a team
  admin pulls a member's *external* upload's secretCode out of the admin
  transfers list, then signs themselves a download token).
- `/api/auth/login` has no rate limiting and no lockout — pre-existing,
  unchanged.

---

## How to act on this report

Suggested order for the patch sequence (each is independent):

1. **#5** — delete one `console.log` line in the webhook, rotate
   `STRIPE_WHSEC` in Stripe. ~5 minutes; immediate risk reduction with
   essentially zero blast radius.
2. **#1** + **#2** — add role gates on the two Stripe billing endpoints.
   Both are 3-line changes, and together they close the worst Member-attack
   surface (team destruction + billing abuse).
3. **#3** — change the `team:` denormalization in `/api/transfer/new` to
   ignore the uploader's team when the upload is going to someone else's
   request. Add a regression test (assert `transfer.team` is `undefined`
   when `transferRequest` is set and the uploader is on a different team).
4. **#4** — decide on the invite acceptance model. The lowest-friction
   patch is to invalidate the invitee's existing sessions when minting the
   takeover session, and stop the silent `fullName` write. The cleanest
   patch is the magic-link confirmation layer.
5. Triage the HIGH / MEDIUM list above.

Once 1-4 are in, the Teams plan can ship to paying tenants with the
understanding that the remaining issues are owner-or-admin trust violations
or pre-existing platform-wide patterns, not Member-can-attack-team primitives.

---

# Round 2 — Additional permission problems

Second pass focused on **role-boundary enforcement** between Owner / Admin /
Member, and on places where the team's billing or branding state can be
mutated by someone who shouldn't have that authority. Three new HIGHs and a
handful of MEDIUMs / LOWs. None of the Round-1 CRITICALs are revisited here.

## HIGH — Admin can demote, promote, and shuffle peer Admins without Owner consent

**File:** `next/src/app/api/team/users/[userId]/route.js:93-161` (PUT handler)

The role-change endpoint gates on `OWNER || ADMIN`:

```js
if (auth.user.role !== ROLES.OWNER && auth.user.role !== ROLES.ADMIN) {
  return NextResponse.json(resp("Forbidden"), { status: 403 })
}
// ...
if (user.role === ROLES.OWNER) {
  return NextResponse.json(resp("Owner role cannot be changed"), { status: 403 })
}

const fromRole = user.role
user.role = role          // <-- ADMIN can write ADMIN here against another ADMIN
await user.save()
```

The only target-role guard is "can't target Owner." There's no
"Admin can't change another Admin's role" guard. The UI matches the API
permissively — `UserList.js:33`'s `canManageRoles` returns true for an Admin
viewing any non-Owner, including peer Admins.

### What that lets a malicious or compromised Admin do

- Demote **any other Admin** to Member with one POST. The target Admin
  loses all admin privileges and gets booted out of `/app/admin/*` on the
  next request (the layout redirects on role change). They don't get
  notified beyond the existing role-changed email.
- Promote **any Member** to Admin. The new co-conspirator can then help
  demote the rest, etc.
- The Owner only finds out via the activity feed (and the role-changed
  email *to the demoted user*, not to the Owner).

### Asymmetry with DELETE

`DELETE /api/team/users/[userId]` on the same file is Owner-only
(`route.js:28`). So Admins can't *remove* peer Admins, but they *can*
neutralise them. Combined with promote-Member-to-Admin, a single Admin
can effectively replace every peer with people they control while still
leaving the existing Admins in `team.users` (so the Owner doesn't see
sudden departures, just role flips in the feed).

### Fix

Restrict ADMIN target role changes to Owner-only. The minimal patch
adds one branch after the existing OWNER guard:

```js
// Only the Owner can promote into / demote out of ADMIN. Admins can
// flip MEMBER ↔ MEMBER no-ops or … nothing useful, really — but they
// shouldn't be able to mess with each other.
if (
  auth.user.role === ROLES.ADMIN &&
  (user.role === ROLES.ADMIN || role === ROLES.ADMIN)
) {
  return NextResponse.json(
    resp("Only the team owner can change Admin roles"),
    { status: 403 }
  )
}
```

Then update `UserList.js:33` to hide the menu when the target is also an
Admin and the viewer isn't the Owner, so the UI matches the new API.

---

## HIGH — Admin can drain Owner's saved card by chaining "invite with autoPurchaseSeat → revoke invite"

**Files:**
- `next/src/app/api/team/invite/route.js:62-74` (POST: accepts `autoPurchaseSeat: true` for any Owner-or-Admin)
- `next/src/app/api/team/invite/route.js:110-144` (DELETE: revokes invites for any Owner-or-Admin, **does not decrement Stripe seat count**)
- `next/src/lib/server/teamSeats.js:59-80` (`purchaseSeats` uses `proration_behavior: "always_invoice"` → immediate invoice, immediate charge)

### The asymmetry

The codebase enforces a clear "billing actions are Owner-only" boundary for
the direct billing endpoints:

- `PUT /api/team/seats` requires `ROLES.OWNER` (route.js:20).
- `POST /api/stripe/create-checkout-session` (now requires OWNER for the
  teams branch — see Round 1 CRITICAL #2).
- `POST /api/stripe/create-customer-portal-session` (now requires OWNER for
  team users — see Round 1 CRITICAL #1).

But `POST /api/team/invite` with `autoPurchaseSeat: true` ends up calling
`purchaseSeats(team, additionalSeats)` directly
(`api/team/invite/route.js:68`), which immediately invoices Stripe with
`proration_behavior: "always_invoice"` and charges the team's default
payment method **before** the invite is even sent. Admin can call this.

The Admin then revokes the invite via `DELETE /api/team/invite` (also
Admin-allowed). The Stripe seat quantity is **not decremented** on revoke.
The team is left with N+1 seats they didn't ask for and an invoice on
file.

### Concrete steps

```
# As an Admin (not the Owner)
curl -X POST https://transfer.zip/api/team/invite \
  -H 'Cookie: token=<admin-session>' \
  -H 'content-type: application/json' \
  -d '{"email":"a1@x.com","autoPurchaseSeat":true,"role":"member"}'

# Repeat with a2@x.com, a3@x.com, …, up to PLANS.teams.maxSeats (25).
# Each call → immediate Stripe invoice for one extra seat at $10-15/mo.

# Then revoke each invite:
curl -X DELETE https://transfer.zip/api/team/invite \
  -H 'Cookie: token=<admin-session>' \
  -H 'content-type: application/json' \
  -d '{"_id":"<invite-id>"}'

# Seats stay elevated. Stripe keeps billing the Owner's card.
# Repeat across multiple billing cycles by adjusting downwards manually
# in Stripe portal (which the Admin no longer has access to after the
# Round-1 fix), or simply max it out.
```

A *single* run takes the team from N seats to 25 seats. Cost delta at the
default monthly price (per `pricing.js:101`) is $15 × (25 − N) charged
*immediately* via `always_invoice`.

The Owner has no consent prompt. The Owner finds out via the activity feed
(`SEAT_PURCHASED` events, but those say "Admin invited X (1 seat added)",
not "you were charged $375 today"), and via Stripe's invoice email. They
can call Stripe to dispute, but the line item is for a real subscription
upgrade they technically authorised by giving Admin role.

### Fix

Reuse the same gate as `PUT /api/team/seats`: Admin can invite *within
existing capacity*, but `autoPurchaseSeat: true` requires `ROLES.OWNER`.

```js
const autoPurchaseSeat = body.autoPurchaseSeat === true
// ...
if (autoPurchaseSeat && auth.user.role !== ROLES.OWNER) {
  return NextResponse.json({
    success: false,
    message: "Only the team owner can purchase additional seats. Ask your Owner to add a seat first.",
    code: "SEAT_PURCHASE_OWNER_ONLY",
  }, { status: 403 })
}
```

A complementary fix: when a pending invite is revoked, **decrement** the
seat count to its lower bound (the higher of `minSeats` and
`memberCount + remainingPendingInvites`). Either via `setSeatCount` on
revoke, or by removing the seat at end-of-period. Today the invite-driven
seat purchase is monotonic-up only, which makes the "invite then revoke"
pattern a one-way drain.

---

## HIGH — `redeemTeamInviteForUser` auto-purchases a seat without re-checking who's allowed to authorise the purchase

**File:** `next/src/lib/server/teamInvites.js:47-58`

```js
let seatsPurchasedOnAccept = 0
if (team.users.length >= (team.seats || 0)) {
  try {
    seatsPurchasedOnAccept = (team.users.length + 1) - (team.seats || 0)
    await purchaseSeats(team, seatsPurchasedOnAccept)
  } catch (err) {
    // ...
  }
}
```

The accept path lives in `lib/server/teamInvites.js` and is called from
both `POST /api/invite/[token]` and (now) from any future entry that
wants to redeem. It immediately fires `purchaseSeats` against the team's
Stripe customer if capacity has been eroded between invite send and
accept — *the invitee* (who has no role in the team and no authority over
billing) is the actor that completes the API call. There's no "did the
team's Owner consent to this growth" check, because the invite itself is
treated as that consent.

That's fine in the *normal* case (Admin sends an invite when they have a
seat free, then Owner reduces seats; the team is over-capacity-by-one
when the invitee accepts and the auto-purchase honours the original
invite).

It's **not** fine when chained with the Admin issue above:

1. Admin sends 20 invites (no `autoPurchaseSeat`). Team is at capacity, 1
   pending invite would put it over — that one is blocked.
2. Owner reduces seat count via the portal (the Admin can't do this
   directly any more after Round-1 fix). Now team is over-capacity.
3. Pending invitees accept. Each acceptance auto-purchases a seat.

Outcome: the Admin can pre-stage many cheap invites and the **invitees**
are the ones whose accept-clicks generate the Stripe charges, weeks
later, after the Owner thought they'd reduced seats.

The fix that makes most sense is layered: (a) the autoPurchaseSeat-only
gate above kills the cheap chained version, (b) the accept-time
auto-purchase should respect a cap — e.g. only auto-purchase if the
*sum* of accepted-this-window seats stays below the original team
authorisation. The simplest concrete cap: only auto-purchase if the
invite was explicitly sent with `autoPurchaseSeat: true` (which is now
Owner-gated after the HIGH above), and otherwise reject the accept with
`code: "SEATS_FULL"` and let the Owner re-invite.

```js
if (team.users.length >= (team.seats || 0)) {
  if (!invite.autoPurchaseAllowed) {
    throw new InviteRedemptionError(
      "This team is at seat capacity. Ask the team owner to add a seat and re-send the invite.",
      { code: "SEATS_FULL", status: 409 }
    )
  }
  // … existing auto-purchase code …
}
```

Requires adding `autoPurchaseAllowed: Boolean` to the `TeamInvite` schema
(default false), and setting it to `true` only when an Owner sent the
invite with `autoPurchaseSeat: true`.

---

## MEDIUM — Admin can rename the team, edit/delete any team brand profile, and revoke any pending invite

These are deliberate per `TEAM_TODO.md` ("Admin = Full control over team
settings") but worth surfacing as a single bundle since they're
collectively a meaningful expansion of Admin power vs. how most "Admin
under Owner" teams work in other SaaS products:

- `PUT /api/team/route.js:11` — Admin can rename the team. New name shows
  up in every outgoing invite/share email's subject and body.
  (`mail.js:75-114`).
- `findManageableBrandProfile` (`brandProfiles.js:39`) scopes by `team`,
  not by `author`. Admin can edit or delete any brand profile in the
  team, including ones the Owner created. `PUT
  /api/brandprofile/[id]/route.js` also unconditionally clobbers
  `iconUrl`/`backgroundUrl` if the body omits them (also flagged in
  Round 1 — the MEDIUM "silently destroys the icon/background").
- `DELETE /api/team/invite` (route.js:110) — Admin can revoke an invite
  the Owner sent (and vice versa).

If you intend any of these to be Owner-only ("Admin can manage *their
own* brand profiles, but only the Owner can touch the canonical company
brand"), the fix template is the same: add `if (user.role !== OWNER &&
!profile.author.equals(user._id)) return 403`, or rename-specific
guards. If the current grants are intentional, the fix is to document
it in the customer-facing role description and on the role-pick UI in
`AddUserButton.js:23-26`, where the current text "Full control over
team settings" is suggestive but not specific.

---

## MEDIUM — Team-membership verification is inconsistent across team-admin routes

Two patterns coexist:

**Pattern A — trust `auth.team` (the populated relation from the session):**

```js
// api/team/route.js:26
const team = await Team.findById(admin.team._id)

// api/team/onboard/route.js:12
const team = await Team.findById(admin.team._id)

// api/team/events/route.js:17
const query = { team: admin.team._id }

// api/team/transfers/route.js:11
const transfers = await listTransfersForTeam(admin.team)

// api/team/transfers/[id]/route.js:22
const transfer = await Transfer.findOne({ _id: transferId, team: admin.team._id })
```

**Pattern B — re-query `Team.findOne({ users: auth.user._id })`:**

```js
// api/team/seats/route.js:33
const team = await Team.findOne({ users: auth.user._id })

// api/team/seats/preview/route.js:24
const team = await Team.findOne({ users: auth.user._id })

// api/team/invite/route.js:36 and :122
const team = await Team.findOne({ users: auth.user._id })
```

Pattern A is faster (the team is already on the session) but doesn't
verify that `team.users` still contains the user. Pattern B does. The
two diverge whenever `user.team` and `team.users` drift apart, which the
DELETE-user handler can leave behind on a partial failure:

```js
// api/team/users/[userId]/route.js:61-69
await Team.updateOne({ _id: team._id }, { $pull: { users: userId } })   // step 1
await User.updateOne({ _id: userId },                                    // step 2
  { $unset: { team: 1 }, $set: { role: ROLES.OWNER } }
)
```

If step 1 succeeds but step 2 fails (network partition mid-handler,
write rejected by a hook, etc.), the user is no longer in `team.users`
but their `user.team` still points to the team and `role` is still
`ADMIN`. Next request: `useTeamAdminAuth()` admits them, Pattern A
endpoints (rename, onboard, events, transfers list/extend/delete) all
*still work* against the team they were just removed from. Pattern B
endpoints (seats, invites) start returning 404.

The fix is to standardise on one. Pattern A is fine if it also asserts
membership before trusting:

```js
// In useTeamAdminAuth, after fetching auth:
if (!auth.team.users?.some(id => id.equals(auth.user._id))) return null
```

Or, more cheaply, do the `Team.updateOne` and `User.updateOne` inside a
single Mongoose session/transaction in the DELETE handler so they can't
drift.

---

## MEDIUM — Owner has no transfer-of-ownership and no leave-team flow

There is no API to:
- transfer Owner role to another user (`/api/team/users/[userId]` PUT
  rejects any change away from `ROLES.OWNER`), or
- have the Owner leave their own team (`/api/user` DELETE rejects on
  `user.team`, and the DELETE-user handler refuses self-delete and
  refuses to touch any user whose role is `OWNER`).

Combined with the "Owner is the only role that can cancel the
subscription via the portal" (Round 1 CRITICAL #1 fix) and "Owner is the
only role that can buy seats" (Round 1 CRITICAL #2 fix + this round's
autoPurchaseSeat HIGH), the Owner is now a **single point of failure**
for the team:

- If the Owner's account is compromised, every billing primitive is
  exposed and no one else can lock the attacker out. (Admins can't
  demote the Owner; can't access billing; can't reach the portal.)
- If the Owner leaves the company, the team is stuck. Admins can run
  day-to-day operations but can't pay the next invoice, change the card,
  or upgrade. The team eventually lapses → `handleSubscriptionDeleted`
  fires → team dissolved, transfers expired, sessions invalidated. No
  graceful path.

The TEAM_TODO.md already calls this out as out-of-scope ("Owner
transfer — Owner is currently immutable — if they get hit by a bus the
team is stuck"). It really shouldn't be out of scope for a launch that
markets "Centralized billing" and "Member management" to companies.
Minimum viable: an Owner-only `POST /api/team/transfer-ownership` that
takes a target Admin's id, demotes self to Admin, and promotes target to
Owner in one transaction. Bonus: a `POST /api/team/leave` for Members
and Admins so the team isn't a Hotel California.

---

## MEDIUM — `useTeamAdminAuth` doesn't verify that the populated team's owner role matches the session's role

A small variant of the inconsistency above. `useTeamAdminAuth` returns
`{ ..., isOwner: user.role === ROLES.OWNER }` based purely on the user
document's `role` field. There's no cross-check that the team actually
treats this user as the Owner (i.e., that there is exactly one User with
`team = this team` and `role = OWNER`, and that user is the session's
user).

For a healthy team that's the same thing. But the codebase has at least
two places (Stripe webhook line 84 and line 214) where it queries
`User.findOne({ team: teamId, role: ROLES.OWNER })` — i.e. they trust the
*reverse* lookup. If the data drifts, those two views of "who's the
owner" can diverge:

- The session-side view (Owner is whoever's role says so) admits person A.
- The webhook side (Owner is whoever's User.findOne returns first) sees
  person B.

This is unlikely to be exploitable today, but the asymmetry between
"role field" and "team membership" is the same root cause as the
Pattern A vs Pattern B issue above. Same fix family — make membership
the single source of truth.

---

## LOW — `Member can use any team brand profile to phish under the team's name`

`findUsableBrandProfile` (`brandProfiles.js:34`) returns *any* team brand
profile to *any* team member. A Member can attach the company's brand
profile to their own transfers or transfer-requests, including ones
sent to external recipients. The branded email subject says "Files
available - Acme Inc.", the download page shows the Acme logo, and the
Member has typed any payload they want into the description and file
names.

Not a privilege escalation against the team — the brand is the team's
asset and the Member is on the team — but it's a phishing primitive
hand-delivered to any team member who turns malicious or whose account
is compromised. Worth either (a) limiting brand-profile use to
team-internal recipient lists (require recipient email's domain to
match an allow-list set by the Owner), or (b) at minimum logging a
`TeamEvent` of type `TRANSFER_CREATED_WITH_BRAND` so the Owner can audit
"who's sending what under our logo."

---

## LOW — Admins see secret-coded URLs for every team transfer

`toJsonAsTeamAdmin` (`models/Transfer.js:167-193`) includes the
`secretCode`. The intent is "admin can download to verify / pull a copy
before deletion" but the practical effect is that every Admin can fetch
every team transfer's bytes regardless of who created it, simply by
hitting `/transfer/<secretCode>` (no auth) or `/api/sign?secretCode=…`
(no auth). Members may reasonably believe their team-tagged transfers
are at most *visible* to Admins (file names, sizes); in practice
they're fully *downloadable*.

If you want a less-than-download view for Admins, drop `secretCode` from
`toJsonAsTeamAdmin` and add an explicit `POST /api/team/transfers/[id]/sign`
that returns a one-time download token only when the admin needs the
content. Same trust grant, but it leaves an audit trail and an explicit
intent ("I am downloading X").

---

## How this changes the patch order

After Round 1's four fixes plus the three HIGHs above:

| Action                                      | Today (post Round-1) | After Round-2 HIGHs   |
|---------------------------------------------|----------------------|----------------------|
| Cancel team subscription                    | Owner                | Owner                |
| Change card / view invoices                 | Owner                | Owner                |
| Buy seats directly                          | Owner                | Owner                |
| Buy seats via invite + autoPurchase         | Owner + **Admin**    | Owner                |
| Trigger auto-purchase via accepting invite  | invitee always       | Only when Owner pre-authorised |
| Demote / promote another Admin              | Owner + **Admin**    | Owner                |
| Promote a Member to Admin                   | Owner + **Admin**    | Owner                |
| Demote an Admin to Member                   | Owner + **Admin**    | Owner                |
| Rename team / edit team brand               | Owner + Admin        | Owner + Admin (unchanged — flagged as design decision) |
| Remove a Member                             | Owner                | Owner                |
| Remove an Admin                             | Owner                | Owner                |

The end state for billing-and-role authority is "Admin is a powerful
operational role under the Owner, but cannot touch *who* runs the team
or *what* the team pays for." That matches "Admin" in most B2B SaaS
products and avoids the chained-Admin-takeover scenarios above.

Recommended patch order from here:

1. The **Admin role-change** HIGH — one branch in `team/users/[userId]/PUT`,
   one branch in `UserList.js`. Smallest change with the largest reduction
   in role-confusion risk.
2. The **autoPurchaseSeat** HIGH — one branch in `team/invite/POST`.
3. The **redeem-time auto-purchase** HIGH — adds an `autoPurchaseAllowed`
   bit to `TeamInvite` and a check in `teamInvites.js`. Slightly larger
   change because of the schema field, but unblocks the chained attack.
4. The **transfer-of-ownership / leave-team** MEDIUM (or at least the
   transfer-of-ownership half), so the Owner ceases to be an
   un-recoverable single point of failure once you've concentrated all
   billing/role authority on them.

