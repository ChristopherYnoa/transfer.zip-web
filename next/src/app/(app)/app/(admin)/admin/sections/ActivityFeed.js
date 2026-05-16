import {
  UserPlusIcon,
  UserMinusIcon,
  UserCheckIcon,
  MailIcon,
  MailXIcon,
  ShieldIcon,
  SendIcon,
  Trash2Icon,
  CreditCardIcon,
} from "lucide-react";

const TYPES = {
  invite_sent: {
    icon: MailIcon,
    label: (e) => `Invited ${e.data.email}${e.data.resent ? " (resent)" : ""}`,
  },
  invite_revoked: {
    icon: MailXIcon,
    label: (e) => `Revoked invite to ${e.data.email}`,
  },
  invite_accepted: {
    icon: UserCheckIcon,
    label: (e) => `${e.data.email} joined the team`,
  },
  member_removed: {
    icon: UserMinusIcon,
    label: (e) => `Removed ${e.data.email || "a member"}`,
  },
  role_changed: {
    icon: ShieldIcon,
    label: (e) => `Changed ${e.data.email}'s role from ${e.data.from} to ${e.data.to}`,
  },
  seat_purchased: {
    icon: CreditCardIcon,
    label: (e) => {
      const n = e.data.count || 1
      const seat = n === 1 ? "seat" : "seats"
      return `Added ${n} ${seat}${e.data.email ? ` for ${e.data.email}` : ""}`
    },
  },
  transfer_created: {
    icon: SendIcon,
    label: (e) => `Created transfer "${e.data.transferName || "Untitled"}"`,
  },
  transfer_deleted: {
    icon: Trash2Icon,
    label: (e) => `Deleted transfer "${e.data.transferName || "Untitled"}"${e.data.byAdmin ? " (admin)" : ""}`,
  },
};

const DEFAULT_ENTRY = {
  icon: UserPlusIcon,
  label: (e) => e.type,
};

function timeAgo(iso) {
  const seconds = Math.floor((new Date() - new Date(iso)) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export default function ActivityFeed({ events }) {
  return (
    <ul className="divide-y">
      {events.map(event => {
        const meta = TYPES[event.type] || DEFAULT_ENTRY;
        const Icon = meta.icon;
        return (
          <li key={event.id} className="flex items-start gap-3 py-3">
            <Icon size={16} className="text-gray-400 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800">{meta.label(event)}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {event.actor ? (event.actor.fullName || event.actor.email) : "System"}
                {" · "}
                {timeAgo(event.createdAt)}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
