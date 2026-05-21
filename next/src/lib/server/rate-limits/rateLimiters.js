import { EMAILS_PER_DAY_LIMIT } from "@/lib/getMaxRecipientsForPlan";
import { RateLimiterMongo } from "rate-limiter-flexible";

// TODO: use this instead of home-cooked SentEmail mongoose shit
/**
 * 
 * @param {*} conn 
 * @returns {RateLimiterMongo}
 */
export const getSentEmailRateLimiter = (conn) => {
  // const conn = await dbConnect()
  let cached = global.sentEmailRateLimiter;
  if (cached) return cached

  // max 50 emails every 18 hours
  const rateLimiter = new RateLimiterMongo({
    storeClient: conn.connections[0],
    points: EMAILS_PER_DAY_LIMIT,
    tableName: "ratelimit-sent-email",
    duration: 3600 * 24 // 24hrs
  })
  global.sentEmailRateLimiter = rateLimiter
  return rateLimiter
}

/**
 * Per-user throttle on the DNS-recheck endpoint. 30 checks/min is plenty
 * for the dialog's 5s polling cadence and covers manual "check now"
 * clicks, while blocking a hot loop from a logged-in user.
 *
 * @param {*} conn
 * @returns {RateLimiterMongo}
 */
export const getCustomDomainCheckRateLimiter = (conn) => {
  let cached = global.customDomainCheckRateLimiter;
  if (cached) return cached

  const rateLimiter = new RateLimiterMongo({
    storeClient: conn.connections[0],
    points: 30,
    tableName: "ratelimit-customdomain-check",
    duration: 60,
  })
  global.customDomainCheckRateLimiter = rateLimiter
  return rateLimiter
}