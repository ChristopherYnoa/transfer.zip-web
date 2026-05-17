import Stripe from 'stripe'

let cached = global.stripe

if (!cached) {
  cached = global.stripe = { instance: null }
}

/**
 *
 * @returns {Stripe}
 */
function getStripe() {
  if (cached.instance) {
    return cached.instance
  }
  cached.instance = new Stripe(process.env.STRIPE_SK)
  return cached.instance
}

const LIVE_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"]

async function userHasLiveStripeSubscription(user) {
  if (!user?.stripe_customer_id) return false
  const subs = await getStripe().subscriptions.list({
    customer: user.stripe_customer_id,
    status: "all",
    limit: 100,
  })
  return subs.data.some(s => LIVE_SUBSCRIPTION_STATUSES.includes(s.status))
}

export { getStripe, userHasLiveStripeSubscription }