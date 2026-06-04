import "server-only"
import Transfer from "./mongoose/models/Transfer"
import TransferRequest from "./mongoose/models/TransferRequest"
import DeletedAccount from "./mongoose/models/DeletedAccount"
import { getStripe } from "./stripe"
import { getLimit, LIMIT } from "@/lib/pricing"

export const IS_DEV = process.env.NODE_ENV == "development"

export const resp = (json) => {
  if (typeof (json) === "string") {
    return { success: false, message: json }
  }
  else {
    return { success: true, ...json }
  }
}

export const createCookieParams = () => {
  return (
    {
      domain: process.env.COOKIE_DOMAIN,
      httpOnly: true,
      secure: !IS_DEV,
      // Use lax to ensure the token cookie is included when returning
      // from external providers such as Stripe.
      sameSite: "lax",
      expires: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
    }
  )
}

// Two sources: transfers the user authored, plus transfers uploaded into
// any TransferRequest the user owns. Resolving the request IDs up front
// keeps the candidate set tight and means an orphan transfer (whose request
// was deleted) can never match — important because populate maps deleted
// refs to null, which would otherwise sneak past a post-query filter.
// Returns the owned request IDs alongside so callers can classify a transfer
// by request *ownership* without a second query.
const fetchUserTransfersWithOwnedRequests = async (user) => {
  const ownedRequestIds = await TransferRequest.find({ author: user._id }).distinct("_id")
  const transfers = await Transfer.find({
    $or: [
      { author: user._id },
      { transferRequest: { $in: ownedRequestIds } }
    ]
  }).sort({ createdAt: -1 })
  return { transfers, ownedRequestIds }
}

export const listTransfersForUser = async (user) => {
  const { transfers } = await fetchUserTransfersWithOwnedRequests(user)
  return transfers
}

// Split a user's transfers into the dashboard's Sent and Received buckets.
// A transfer is "received" only when it was uploaded into a request THIS user
// owns — not merely because it carries a transferRequest ref. Without the
// ownership check, an authenticated user's upload into someone else's request
// link (author = them, transferRequest = the other person's request) gets
// filed as Received even though, to them, they sent it.
// Pure + separately exported so the rule is unit-testable without a DB.
// Assumes transferRequest refs are unpopulated ObjectIds (as fetched above).
export const splitSentAndReceived = (transfers, ownedRequestIds) => {
  const ownedIds = new Set(ownedRequestIds.map(id => id.toString()))
  const sent = []
  const received = []
  for (const transfer of transfers) {
    const intoOwnRequest = transfer.transferRequest && ownedIds.has(transfer.transferRequest.toString())
    if (intoOwnRequest) received.push(transfer)
    else sent.push(transfer)
  }
  return { sent, received }
}

export const listSentAndReceivedForUser = async (user) => {
  const { transfers, ownedRequestIds } = await fetchUserTransfersWithOwnedRequests(user)
  return splitSentAndReceived(transfers, ownedRequestIds)
}

// Team-wide list for the Owner/Admin dashboard.
// Includes only transfers where author belongs (or belonged) to the team
// at creation time — i.e. Transfer.team matches. Does NOT include guest
// uploads to a team member's transfer request (those are surfaced to the
// requesting member's per-user view via listTransfersForUser).
export const listTransfersForTeam = async (team) => {
  return Transfer.find({ team: team._id })
    .populate("author", "email fullName")
    .sort({ createdAt: -1 })
}

// Team-wide list of transfer-request links. Tenant boundary is the
// TransferRequest.team field, set at creation time and never updated —
// so requests created before the team field shipped are intentionally
// invisible to admins (we don't backfill via author membership because
// the author's team may have changed since).
export const listTransferRequestsForTeam = async (team) => {
  return TransferRequest.find({ team: team._id })
    .populate("author", "email fullName")
    .sort({ createdAt: -1 })
}

export const getMaxStorageForPlan = (plan) => {
  return getLimit(plan, LIMIT.STORAGE) ?? 0
}

async function customerHasPaid(customerId) {
  const { data: [sub] } = await getStripe().subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
    expand: ['data.latest_invoice'],
  });
  if (!sub) return false;                       // no subscription at all
  if (sub.status === 'trialing') return false;  // still on trial
  if (sub.status === 'active') return true;     // first charge succeeded
  return !!sub.latest_invoice?.paid;            // fall‑back for past_due/unpaid
}

export async function doesUserHaveFreeTrial(user, cookies) {
  // const abTestFreeTrialAvailable = await getAbTestServer(AB_TEST_IS_FREE_TRIAL_AVAILABLE, cookies)
  // if (abTestFreeTrialAvailable == "false") return false

  // Block the delete-and-re-sign-up loop. The tombstone hash is over the
  // normalized email, so +aliases and gmail dot tricks all collapse to the
  // same key.
  if (user?.email && await DeletedAccount.existsForEmail(user.email)) {
    return false
  }

  if (user && !!user.stripe_customer_id) {
    try {
      if (user.usedFreeTrial) {
        return false
      }
      else if (await customerHasPaid(user.stripe_customer_id)) {
        // Users who has paid once can't get free trial anymore.
        return false
      }
    }
    catch (e) {
      console.error("Error in onboarding page:", e)
    }
  }

  return true
}