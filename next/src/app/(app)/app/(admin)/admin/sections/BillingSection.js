import Link from "next/link";
import BIcon from "@/components/BIcon";
import { Button } from "@/components/ui/button";
import { API_URL } from "@/lib/client/Api";
import { humanTimeUntil } from "@/lib/utils";
import pricing from "@/lib/pricing";
import AdminCard from "../AdminCard";

export default function BillingSection({ team, memberCount }) {
  const tier = pricing.teamTier;
  const { name, displayFeatures } = tier;
  const { seats, planCancelling, planValidUntil } = team;

  const timeLeft = planValidUntil ? humanTimeUntil(new Date(planValidUntil)) : null;
  const statusLabel = planCancelling
    ? `Cancelling - ${timeLeft} left`
    : "Active";
  const statusColor = planCancelling ? "bg-amber-100 text-amber-700" : "bg-primary-100 text-primary-700";

  return (
    <AdminCard>
      <div className="border rounded-xl p-5">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">{name}</span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
          <span className="ml-auto text-sm text-gray-500">
            {memberCount} of {seats} seats used
          </span>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-gray-700 sm:grid grid-cols-2">
          {displayFeatures.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <BIcon className="text-gray-400 mt-0.5" name="check" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        <form method="POST" className="mt-4 flex flex-row-reverse" action={API_URL + "/stripe/create-customer-portal-session"}>
          <Button variant="secondary" className="w-full sm:w-fit">Cancel or Manage Billing</Button>
        </form>
        <hr className="my-4" />
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">Need to change seats?</p>
            <p className="text-sm text-gray-500">Seat quantity is managed through your Stripe customer portal.</p>
          </div>
          <Button asChild>
            <Link href="/pricing" className="w-full sm:w-fit">Compare all plans</Link>
          </Button>
        </div>
      </div>
    </AdminCard>
  );
}
