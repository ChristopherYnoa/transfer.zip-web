"use client"

import { useEffect, useRef, useState } from "react"
import { pollMagicLinkStatus, verifyMagicLinkCode } from "@/lib/client/Api"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import Spinner from "./elements/Spinner"
import BIcon from "./BIcon"
import { emailDomains } from "../lib/emailDomains"

const POLL_INTERVAL_MS = 2500

// Rendered after a magic link is requested. Polls the server for status:
// - same-browser click: switch to a "signed in" state with a CTA into /app
// - cross-device click: switch to a 6-digit code input so the user can finish
//   sign-in on this device using the code displayed on the other device
export default function MagicLinkSentArea({ requestId, email, redirectTo = "/app", onReset }) {
  const [stage, setStage] = useState("sent") // sent | codeNeeded | verifying | signedIn
  const [code, setCode] = useState("")
  const [error, setError] = useState(null)
  const stageRef = useRef(stage)
  stageRef.current = stage

  useEffect(() => {
    let cancelled = false
    let timer

    const tick = async () => {
      if (cancelled) return
      try {
        const res = await pollMagicLinkStatus(requestId)
        if (cancelled) return
        if (res.status === "consumed-same-browser" || res.status === "consumed") {
          setStage("signedIn")
          return
        }
        if (res.status === "opened-other-device" && stageRef.current === "sent") {
          setStage("codeNeeded")
        }
        if (res.status === "expired") {
          setError("This sign-in session expired. Request a new link.")
          return
        }
      } catch (err) {
        if (err.status === 401 || err.status === 404) {
          setError("This sign-in session expired. Request a new link.")
          return
        }
        // transient errors fall through to the next tick
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [requestId])

  const handleVerify = async (e) => {
    e.preventDefault()
    setError(null)
    setStage("verifying")
    try {
      await verifyMagicLinkCode(requestId, code)
      setStage("signedIn")
    } catch (err) {
      setError(err.message)
      setStage("codeNeeded")
    }
  }

  if (stage === "signedIn") {
    return (
      <div className="space-y-4 text-center">
        <div className="text-3xl">
          <BIcon name="check-circle-fill" className="text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">You're signed in</p>
          {/* <p className="text-sm text-gray-600 mt-1">Now go send some files.</p> */}
        </div>
        <Button onClick={() => { window.location.href = redirectTo }} className="w-full">
          Go to dashboard
        </Button>
      </div>
    )
  }

  const domain = email && email.split("@")[1]
  const mailInfo = domain ? emailDomains[domain] : null
  const mailLink = mailInfo
    ? <a className="text-primary hover:underline" href={mailInfo.url} target="_blank" rel="noopener noreferrer">{mailInfo.prettyName}</a>
    : domain
      ? <a className="text-primary hover:underline" href={`https://${domain}`} target="_blank" rel="noopener noreferrer">{domain}</a>
      : null

  if (stage === "codeNeeded" || stage === "verifying") {
    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-700">
          The sign-in email was opened on a different browser. Enter the 6-digit code shown there to finish signing in here.
        </div>
        <form onSubmit={handleVerify} className="space-y-2">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            className="tracking-[0.5em] text-center text-lg font-mono"
          />
          <Button disabled={code.length !== 6 || stage === "verifying"} className="w-full">
            {stage === "verifying" && <Spinner />} Verify and sign in
          </Button>
        </form>
        {error && <p className="text-red-600 text-sm text-center">{error}</p>}
        {onReset && (
          <button type="button" onClick={onReset} className="text-xs text-gray-500 hover:text-gray-700 block mx-auto">
            Use a different email
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-center text-sm">
      <p className="text-gray-800">
        <BIcon name="envelope-fill" className="me-1" /> Check your inbox{mailLink && <> at {mailLink}</>}!
      </p>
      <div className="text-gray-500 text-xs flex items-center justify-center gap-2">
        <Spinner sizeClassName="h-3 w-3" /> Waiting for you to open the link...
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {onReset && (
        <button type="button" onClick={onReset} className="text-xs text-gray-500 hover:text-gray-700">
          Use a different email
        </button>
      )}
    </div>
  )
}
