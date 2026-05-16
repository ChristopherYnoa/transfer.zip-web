import BIcon from "@/components/BIcon";
import GenericPage from "@/components/dashboard/GenericPage";
import EmptySpace from "@/components/elements/EmptySpace";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import BrandProfileCard from "./BrandProfileCard";

// Shared between solo (/app/branding) and team (/app/admin/branding) flows.
// All routing-specific decisions are passed in as props so this stays dumb.
//
// Props:
//   title         page title rendered via GenericPage
//   profiles      already-serialized via toJsonAsClient
//   hasFeature    plan grants CUSTOM_BRANDING
//   canManage     true if the viewer is allowed to create/edit (Owner/Admin
//                 on a team, or any solo user with the feature)
//   newHref       link target for the "New Brand Profile" button
//   editHref(id)  link target for opening a profile in the editor
//   emptyCta      optional ReactNode rendered inside the empty-state when
//                 the feature is not available (e.g. an "Upgrade to Pro" CTA)
export default function BrandingPageShell({
  title = "Branding",
  profiles,
  hasFeature,
  canManage,
  newHref,
  editHref,
  emptyCta,
}) {
  const showNewButton = hasFeature && canManage;

  const side = showNewButton ? (
    <Button variant="white" asChild>
      <Link href={newHref}>
        <BIcon name="plus-lg" />New Brand Profile
      </Link>
    </Button>
  ) : null;

  return (
    <GenericPage title={title} side={side}>
      {profiles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map(profile => (
            <BrandProfileCard
              key={profile.id}
              id={profile.id}
              name={profile.name}
              iconUrl={profile.iconUrl}
              backgroundUrl={profile.backgroundUrl}
              editHref={editHref(profile.id)}
            />
          ))}
        </div>
      ) : (
        <EmptySpace
          title="Showcase Your Unique Brand Identity"
          subtitle="Add your own logo, customize backgrounds, and include your branding directly in emails and download pages for a seamless, professional look."
        >
          {!hasFeature && emptyCta}
        </EmptySpace>
      )}
    </GenericPage>
  );
}
