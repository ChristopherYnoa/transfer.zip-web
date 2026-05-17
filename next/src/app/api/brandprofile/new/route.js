import BrandProfile from "@/lib/server/mongoose/models/BrandProfile";
import { resp } from "@/lib/server/serverUtils";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { NextResponse } from "next/server";
import { processAndUploadBrandProfileImages } from "@/app/api/brandprofile/brandProfileUtils";
import {
  brandProfileOwnershipFor,
  canManageBrandProfiles,
} from "@/lib/server/brandProfiles";
import { FEATURE } from "@/lib/pricing";

export async function POST(req) {
  const auth = await useServerAuth();
  if (!auth) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 });
  }
  const { user } = auth;

  if (!user.hasFeature(FEATURE.CUSTOM_BRANDING)) {
    return NextResponse.json(resp("User needs to upgrade."), { status: 409 });
  }
  if (!canManageBrandProfiles(user)) {
    return NextResponse.json(resp("Only the team Owner or Admin can manage branding."), { status: 403 });
  }

  const { name, iconUrl, backgroundUrl } = await req.json();

  if (!name || typeof name !== "string") {
    return NextResponse.json(resp("name required"), { status: 400 });
  }

  const profile = new BrandProfile({
    ...brandProfileOwnershipFor(user),
    name,
    iconUrl: null,
    backgroundUrl: null,
    lastUsed: new Date(),
  });

  await profile.save();

  try {
    const processed = await processAndUploadBrandProfileImages({
      iconUrl,
      backgroundUrl,
      brandProfileId: profile._id.toString(),
    });

    if (processed.iconUrl) profile.iconUrl = processed.iconUrl;
    if (processed.backgroundUrl) profile.backgroundUrl = processed.backgroundUrl;
    if (processed.iconUrl || processed.backgroundUrl) await profile.save();
  } catch (e) {
    return NextResponse.json(resp(e.message), { status: 400 });
  }

  return NextResponse.json(resp({ brandProfile: profile.toJsonAsClient() }));
}
