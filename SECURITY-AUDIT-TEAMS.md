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
