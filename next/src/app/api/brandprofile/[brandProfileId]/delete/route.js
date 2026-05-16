import { resp } from "@/lib/server/serverUtils";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { NextResponse } from "next/server";
import { findManageableBrandProfile } from "@/lib/server/brandProfiles";

export async function POST(req, { params }) {
  const auth = await useServerAuth();
  if (!auth) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 });
  }
  const { user } = auth;
  const { brandProfileId } = await params;

  const profile = await findManageableBrandProfile(user, brandProfileId);
  if (!profile) {
    return NextResponse.json(resp("brand profile not found"), { status: 404 });
  }

  await profile.deleteOne();

  return NextResponse.json(resp({ brandProfile: profile.toJsonAsClient() }));
}
