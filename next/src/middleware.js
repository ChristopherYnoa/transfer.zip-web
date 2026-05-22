import { NextResponse } from "next/server"
import { IS_SELFHOST } from "./lib/isSelfHosted"
import { AB_TESTS } from "./lib/abtests"
import { abTest } from "./lib/server/abtestServer"

const selfHostBlacklist = [
  "/api/stripe"
]

const selfHostWhitelist = [
  "/change-password",
  "/app", "/legal", "/api",
  "/transfer", "/upload",
  "/quick", "/signin"
]

const customDomainWhitelist = [
  "/api", "/transfer", "/upload"
]

// Hosts our deployment serves directly. Anything else is a custom domain.
// We trust Caddy to only forward requests for hosts we've actually issued
// certs for, but we still match strictly here so a header like
// `eviltransfer.zip` can't impersonate our zone.
const isOwnHost = (host) => {
  if (!host) return true
  const lower = host.toLowerCase().split(":")[0]
  const zones = ["transfer.zip"]
  if (process.env.NEXT_PUBLIC_DL_DOMAIN) zones.push(process.env.NEXT_PUBLIC_DL_DOMAIN.toLowerCase())
  return zones.some((zone) => lower === zone || lower.endsWith(`.${zone}`))
}

const legacyRedirects = [
  { from: "/quick-share", to: "/quick" },
  { from: "/login", to: "/signin" },
  { from: "/signup", to: "/signin" },
  { from: "/about", to: "/" },
  { from: "/tools/heic-convert", to: "/tools/convert-heic-to-jpg" },
  { from: "/posts/easy_ways_to_share_files_anonymously_in_2025", to: "/how-to/share-files/anonymously" },
  { from: "/posts/easy_ways_to_send_large_files_online_free_without_registration", to: "/how-to/share-files/no-sign-up" },
  { from: /^\/posts.*$/, to: "/how-to" },
]

function applyAbTests(req, res) {
  if (IS_SELFHOST) return res

  // Run AB tests
  AB_TESTS.forEach(test => {
    abTest(test, req, res)
  })

  return res
}

export function middleware(req) {
  const { pathname } = req.nextUrl

  const hostHeader = req.headers.get("host") ?? ""
  const onCustomDomain = !isOwnHost(hostHeader)

  // Add CORS headers for /api requests so they still work cross-origin
  // from the DL domain or any custom domain. Same-origin calls (host is
  // our own zone) don't need CORS and would just get a bogus header.
  if (pathname.startsWith('/api')) {
    let origin
    if (process.env.NEXT_PUBLIC_DL_DOMAIN && hostHeader === process.env.NEXT_PUBLIC_DL_DOMAIN) {
      origin = `https://${process.env.NEXT_PUBLIC_DL_DOMAIN}`
    }
    else if (onCustomDomain) {
      origin = `https://${hostHeader}`
    }

    if (origin) {
      if (req.method === 'OPTIONS') {
        return new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
        })
      }

      const response = NextResponse.next()
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      return response
    }
  }

  // DL domain: short /{uuid} URLs rewrite to /transfer/{uuid}, everything
  // else bounces back to the main site with the same pathname preserved.
  if (process.env.NEXT_PUBLIC_DL_DOMAIN && hostHeader === process.env.NEXT_PUBLIC_DL_DOMAIN) {
    const uuidPattern = /^\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
    const match = pathname.match(uuidPattern)

    if (match) {
      const secretCode = match[1]
      const newUrl = req.nextUrl.clone()
      newUrl.pathname = `/transfer/${secretCode}`
      return NextResponse.rewrite(newUrl)
    }

    const redirectUrl = new URL(pathname, process.env.SITE_URL)
    return NextResponse.redirect(redirectUrl)
  }

  // Custom domains: only let through transfer/upload/api routes so users
  // can't browse our landing page on someone else's domain. Skipped in
  // dev so localhost still serves everything.
  if (onCustomDomain && process.env.NODE_ENV !== "development") {
    if (customDomainWhitelist.every((prefix) => !pathname.startsWith(prefix))) {
      return NextResponse.redirect("https://transfer.zip")
    }
  }

  // Redirect back to /signin if user has no token and wants to use /app
  const token = req.cookies.get("token")
  if (!token && pathname.startsWith("/app")) {
    const newUrl = req.nextUrl.clone()
    newUrl.pathname = "/signin"
    return applyAbTests(req, NextResponse.redirect(newUrl, { status: 302 }))
  }

  // legacy redirects
  const legacyMatch = legacyRedirects.find((entry) => {
    if (entry.from instanceof RegExp) return entry.from.test(pathname)
    return pathname === entry.from
  })
  if (legacyMatch) {
    const newUrl = req.nextUrl.clone()
    newUrl.pathname = legacyMatch.to
    return applyAbTests(req, NextResponse.redirect(newUrl, { status: 301 }))
  }

  if (IS_SELFHOST) {
    const newUrl = req.nextUrl.clone()
    // Restrict access to routes when self-hosting
    if (newUrl.pathname === "/") {
      newUrl.pathname = "/quick"
      return NextResponse.redirect(newUrl, { status: 301 })
    }
    if (
      selfHostWhitelist.every((prefix) => !pathname.startsWith(prefix)) ||
      selfHostBlacklist.some((prefix) => pathname.startsWith(prefix))
    ) {
      newUrl.pathname = "/"
      return NextResponse.redirect(newUrl, { status: 301 })
    }
  }
  else return applyAbTests(req, NextResponse.next())
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|robots.txt|sitemap.xml|static|img|images|assets|sw\.js|mitm.html).*)"]
}