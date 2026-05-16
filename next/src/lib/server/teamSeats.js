import { getStripe } from "./stripe"
import Team from "./mongoose/models/Team"

const LIVE_STATUSES = ["active", "trialing", "past_due"]
const PRORATION_BEHAVIOR = "always_invoice"

async function getTeamSubscriptionAndItem(team) {
  if (!team?.stripe_customer_id) {
    throw new Error("Team has no Stripe customer")
  }
  const stripe = getStripe()
  const subs = await stripe.subscriptions.list({
    customer: team.stripe_customer_id,
    status: "all",
    limit: 10,
  })
  const sub = subs.data.find(s => LIVE_STATUSES.includes(s.status))
  if (!sub) {
    throw new Error("Team has no active subscription")
  }
  const item = sub.items.data[0]
  if (!item) {
    throw new Error("Team subscription has no items")
  }
  return { stripe, sub, item }
}

export async function previewSeatPurchase(team, additionalSeats = 1) {
  if (!Number.isInteger(additionalSeats) || additionalSeats < 1) {
    throw new Error("additionalSeats must be a positive integer")
  }
  const { stripe, sub, item } = await getTeamSubscriptionAndItem(team)
  const targetQuantity = item.quantity + additionalSeats
  const preview = await stripe.invoices.createPreview({
    customer: team.stripe_customer_id,
    subscription: sub.id,
    subscription_details: {
      items: [{ id: item.id, quantity: targetQuantity }],
      proration_date: Math.floor(Date.now() / 1000),
      proration_behavior: PRORATION_BEHAVIOR,
    },
  })
  return {
    amountDue: preview.amount_due,
    total: preview.total,
    currency: preview.currency,
    interval: item.price?.recurring?.interval || "month",
    unitAmount: item.price?.unit_amount || 0,
    currentQuantity: item.quantity,
    targetQuantity,
    additionalSeats,
  }
}

export async function purchaseSeats(team, additionalSeats = 1) {
  if (!Number.isInteger(additionalSeats) || additionalSeats < 1) {
    throw new Error("additionalSeats must be a positive integer")
  }
  const { stripe, sub, item } = await getTeamSubscriptionAndItem(team)
  const targetQuantity = item.quantity + additionalSeats
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, quantity: targetQuantity }],
    proration_behavior: PRORATION_BEHAVIOR,
  })
  // Persist immediately so concurrent invite requests in the same Node process
  // (between our update and the webhook arriving) see the new seat count.
  // The webhook will also update this later; we only bump up, never down.
  await Team.updateOne(
    { _id: team._id, $or: [{ seats: { $lt: targetQuantity } }, { seats: { $exists: false } }] },
    { $set: { seats: targetQuantity } }
  )
  if ((team.seats || 0) < targetQuantity) {
    team.seats = targetQuantity
  }
  return targetQuantity
}
