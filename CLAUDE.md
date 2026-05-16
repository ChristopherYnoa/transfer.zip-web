# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This is a multi-service monorepo. There is no top-level package.json — each service is its own npm workspace:

- [next/](next/) — Next.js 16 (App Router) frontend + API routes. Main user-facing app.
- [worker/](worker/) — Fastify backend that holds the RSA private key (used to sign JWTs for node servers), runs `node-cron` cleanup of expired transfers, and proxies geo lookups + node control calls. Listens on port 3001.
- [signaling-server/](signaling-server/) — Plain Node + `ws` WebSocket server for WebRTC signaling and the binary relay fallback for Quick Transfers. Listens on port 9002.
- [_db/](_db/) — local MongoDB volume (created by docker compose).
- [_local_dev_worker_data/](_local_dev_worker_data/) — local RSA keypair for the worker (created by `local-dev-create-keys.sh`).

The actual file-storage backend (handles uploads/zips/S3) lives in a separate repo: `transfer.zip-node`. The worker reaches it via signed JWT calls; its URL is configured in [next/conf.json](next/conf.json.example).

## Commands

Don't run commands to (re)start the server. When developing, everything is already running correctly.

There are **no automated tests** in this repo. Don't add a "run the tests" step to your plan.

## Architecture

### Two transfer modes

1. **Quick Transfers** — peer-to-peer over WebRTC, end-to-end encrypted with a client-generated AES-GCM 256 key. The signaling-server only brokers the connection; if direct P2P fails (or the file is >10MB, where WebRTC is forced off for speed), traffic is **relayed** through the signaling-server using a custom binary packet protocol with a packet-budget flow-control scheme (see [signaling-server/index.js](signaling-server/index.js)). No file data hits MongoDB. Files only exist while both peers are online.

2. **Stored Transfers** — S3 multipart uploads via Uppy + `@uppy/aws-s3` ([next/src/lib/client/uppy.js](next/src/lib/client/uppy.js)). The client gets presigned URLs from a separate `transfer.zip-node` server (`/upload/sign`, `/upload/multipart/*`) and PUTs parts directly to S3. The Next app stores metadata in MongoDB; bytes never go through Next or the node server. Cross-server auth uses RS256 JWTs signed by the worker.

### Key boundaries

- **next ↔ worker**: HTTP. The worker holds `private.pem`; Next never sees it. Calls go through [next/src/lib/server/workerApi.js](next/src/lib/server/workerApi.js): `workerSign`, `workerGeoSlow`, `workerTransferDelete`, `workerUploadComplete`. The geo lookup is on the worker because the geoip lib didn't play well with Next.
- **next ↔ node server (transfer.zip-node)**: control calls are forwarded *through* the worker (`/forward-node-control/*`) so the worker can sign them. Direct upload/download traffic between client and node bypasses Next entirely.
- **next ↔ signaling-server**: client-side only. Server code never talks to it.

### Next.js app structure

Route groups under [next/src/app/](next/src/app/):
- `(app)/app/*` — authenticated dashboard (sent, received, requests, settings, team). Layout requires a token cookie.
- `(site)/*` — marketing pages and public download/upload pages (`/transfer/[secretCode]`, `/upload/[secretCode]`).
- `(fullscreen)/*` — full-page flows: signin, signup, magic-link, change-password, onboarding, invite acceptance.
- `api/*` — API routes (auth, transfer, transferrequest, upload, download, brandprofile, team, invite, stripe webhook, sign, megadesk-identity, error reporting).

[next/src/middleware.js](next/src/middleware.js) handles:
- redirecting `/app/*` to `/signin` when no token cookie
- legacy URL redirects
- self-host mode: whitelists routes and redirects `/` → `/quick`
- a separate `NEXT_PUBLIC_DL_DOMAIN` (e.g. `trnsf.to`) that rewrites `/{uuid}` → `/transfer/{uuid}` and adds CORS for `/api`
- AB tests (production only — see `IS_SELFHOST` short-circuit)

### Self-host vs hosted mode

`IS_SELFHOST` ([next/src/lib/isSelfHosted.js](next/src/lib/isSelfHosted.js)) is true unless `NEXT_PUBLIC_SELFHOST=false` is set. It gates Stripe routes, AB tests, registration UI, and storage limits (self-host gets effectively unlimited). When changing pricing/feature/permission code, check the `IS_SELFHOST` branch.

### Auth & DB connections

Cookie-based sessions, not JWT. The `token` cookie is a Session document key; [useServerAuth](next/src/lib/server/wrappers/auth.js) looks it up and populates `user` + `user.team`. Google OAuth and email magic-links also create Session rows.

**Two parallel wrapper pairs, pick the one that matches your context:**

1. **API Routes** (`route.js`):
   - `dbConnect()` — [lib/server/mongoose/db.js](next/src/lib/server/mongoose/db.js)
   - `useServerAuth()` — [lib/server/wrappers/auth.js](next/src/lib/server/wrappers/auth.js)

2. **Server Actions** (files with `"use server"`):
   - `dbConnectServerAction()` — [lib/server/mongoose/dbServerAction.js](next/src/lib/server/mongoose/dbServerAction.js)
   - `useServerAuthServerAction()` — [lib/server/wrappers/authServerAction.js](next/src/lib/server/wrappers/authServerAction.js)

The split exists because Next.js Server Actions and Route Handlers don't share the `global.mongoose` module cache when Next runs as a long-running standalone Node process (the standard prod deployment — i.e. not a serverless / Vercel-style environment). Keep the two pairs in sync when changing either. 

The Server Actions variants are **not currently used** anywhere (no `"use server"` files exist yet) but are kept for future use. (Change this line when starting to use Server Actions)

```js
// In API routes
import { useServerAuth } from "@/lib/server/wrappers/auth";
const auth = await useServerAuth();
if (!auth) return NextResponse.json(resp("Unauthorized"), { status: 401 });

// In Server Actions (future)
import { useServerAuthServerAction } from "@/lib/server/wrappers/authServerAction";
const auth = await useServerAuthServerAction();
if (!auth) throw new Error("Unauthorized");
```

### Plans, features, limits, teams

- [next/src/lib/pricing.js](next/src/lib/pricing.js) defines `FEATURE` (boolean) and `LIMIT` (numeric) constants and the `PLANS` map. **Always use these constants** rather than hardcoding plan ids.
- `User.hasFeature(f)` / `User.getLimit(l)` / `User.getPlan()` automatically delegate to `Team` if `user.team` is set, then fall back to `customFeatures` / `customLimits` overrides, then to the plan defaults. Mirror this pattern when adding new gated capabilities.
- Roles ([next/src/lib/roles.js](next/src/lib/roles.js)): `OWNER`, `ADMIN`, `MEMBER`. Default for a new account is `OWNER`.
- The team feature is **in-progress** — see [TEAM_TODO.md](TEAM_TODO.md) for known gaps before assuming it's production-ready (e.g. invite acceptance currently doesn't set `user.team`, no seat validation, no session invalidation on removal).

### Mongoose models

In [next/src/lib/server/mongoose/models/](next/src/lib/server/mongoose/models/). Models export the standard `mongoose.models.X || mongoose.model("X", ...)` pattern (required for Next hot-reload). Each model exposes one or more `toJsonAs*()` instance methods that return the shape safe to send over the wire.

**Always use a `toJsonAs*()` method when passing model data from server to client** — through API route JSON responses, props returned from server components, or any other server→client boundary. Never serialize raw Mongoose documents directly to the client, as they may leak internal fields (password hashes, tokens, internal flags, etc.). If a model is missing one, add it rather than hand-picking fields at the call site.

**Naming convention:**
- `toJsonAsClient()` — the default. Use when there's only one shape the model is sent in (regardless of who the caller is — auth is enforced upstream, not by the serializer).
- `toJsonAsOwner()`, `toJsonAsDownloader()`, `toJsonAsUploader()`, etc. — when the same model has materially different shapes for different audiences (e.g. `Transfer` returns the plaintext password to the owner, but not to a public downloader). Pick the name that matches the trust boundary you're crossing.

The presence of an audience-specific method on a model (e.g. `toJsonAsOwner`) signals "this model has a trust boundary inside it — pick the right variant carefully." A model with only `toJsonAsClient()` is saying "nothing sensitive varies by audience here."

### Logging

Pino is used everywhere (`next-logger` wraps Next, worker uses pino directly). In dev, output is piped through `pino-pretty`. Don't replace with `console.log` in server code.

### Email

[next/src/lib/server/mail/mail.js](next/src/lib/server/mail/mail.js) uses Resend when `RESEND_API_KEY` is set; otherwise it logs the rendered HTML to console (mock mode for self-host without email). Templates are React Email components in `mail/templates/`.

## Conventions worth knowing

- The codebase is **JavaScript, not TypeScript**. **Use `.js` for everything you create** — including files with JSX. The only existing `.jsx` files are vendored shadcn primitives in `components/ui/` and React Email templates in `lib/server/mail/templates/`; don't add to those exceptions.
- Path alias `@/` resolves to `next/src/` (set in `jsconfig.json`).
- Tailwind v4 with shadcn-style `components/ui/*.jsx` primitives. Use these instead of pulling in new UI libs.
- Validation: `zod` schemas at the top of API route files (see [next/src/app/api/transfer/new/route.js](next/src/app/api/transfer/new/route.js) for the pattern).
- Rate limiting: `rate-limiter-flexible` backed by MongoDB, configured in [next/src/lib/server/rate-limits/](next/src/lib/server/rate-limits/).

### Next.js 15/16 Patterns

**IMPORTANT**: In Next.js 15+, `cookies()`, `headers()`, `params`, and `searchParams` are PROMISES and must be awaited:
```js
const cookieStore = await cookies();
const headersList = await headers();
const { id } = await params;
```

### Style Guidelines
- Use **double quotes** for strings (except template literals)
- Use **template strings** when interpolating or multi-line strings
- Use **Tailwind CSS** for styling
- Minimize use of optional chaining (`?.`) — use it only for genuinely optional values, not to hide errors

### Frontend rules

The dashboard UI is the product surface. It needs to feel premium and consistent. Don't ship the kind of LLM-generated tells that scream "AI built this." Read the existing dashboard pages ([settings/SettingsPage.js](next/src/app/(app)/app/(dashboard)/settings/SettingsPage.js), the dashboard `FloatingBar`, etc.) before writing new UI and match what's there.

- **Match the existing color palette.** The codebase uses `gray-*` and `primary-*`. Don't reach for `slate-*`, `zinc-*`, `neutral-*`, or anything else just because a model trained on Tailwind examples wants to.
- **No opacity-suffix colors** (`bg-foo/60`, `border-foo/40`, `text-foo/80`) in new UI components. The exception is the few existing spots in marketing/header code that already use `/N` patterns — don't pile on. Plain solid colors only.
- **No `backdrop-blur`.** Same reason.
- **Use shadcn primitives from [components/ui/](next/src/components/ui/), not native HTML controls.** Specifically: no raw `<select>` — use `Select` from [components/ui/select.jsx](next/src/components/ui/select.jsx). Same for `Dialog`, `Button`, `Input`, etc.
- **Cards on the dashboard are `bg-white rounded-xl p-5 sm:p-6`** with `text-gray-900` for headings and `text-gray-500/600` for muted text. Pills follow the existing `bg-amber-100 text-amber-700` / `bg-primary-100 text-primary-700` shape.
- **Wrap pages in `<GenericPage title="...">`** from [components/dashboard/GenericPage.js](next/src/components/dashboard/GenericPage.js) so the white DashH2 title is consistent across sections.
- **No filler subtitles or "AI-flavored" copy** on stat cards. If the label and value already say everything ("Members: 5/10"), there is no need for a third line saying "All seats accounted for." Cut it.
- **Stick to lucide icons that are already in use** elsewhere in the codebase, and verify the icon exists before importing it. Don't invent icon names.

### Do not code defensively

This is non-negotiable. Before writing a check, **read the function you're calling** and find out what it actually returns or throws. Then trust it.

Concretely, do **not** write any of these:

- `if (!res || !res.success) throw new Error(res?.message || "fallback")` when calling a helper that already throws on failure. The [Api.js](next/src/lib/client/Api.js) helpers (`get`/`post`/`put`/`withBody`) throw a real `Error` on `!res.ok` or `!json.success` — the success path is guaranteed.
- `getErrorMessage(err, fallback)` ladders that probe `typeof err.message === "string"`, then `err.error.message`, then `JSON.stringify(err)`. The thrown error is always an `Error` with a string `.message`. Just write `toast.error(err.message)`.
- `res?.field`, `err?.message`, `obj?.foo?.bar` to "be safe" when the value is not actually optional. Optional chaining is for values that are *genuinely* sometimes absent (e.g. a populated relation that may be unpopulated). It is not a shield against not having read the code.
- `try/catch` blocks that swallow the error and substitute a generic string. The thrown message is the actual cause — surface it.
- Fallback strings for cases that can't happen ("Could not send invite" after a helper that has already thrown a more specific message).

When in doubt, **read the callee** before adding a guard. Three lines of clean code that match the actual contract beat ten lines of paranoia that obscure it.

### Behavior
- Be critical of implementation ideas — challenge approaches if they seem suboptimal rather than just executing them.