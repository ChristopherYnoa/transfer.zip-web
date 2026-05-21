import { resp } from "@/lib/server/serverUtils";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import { NextResponse } from "next/server";
import { processAndUploadBrandProfileImages } from "@/app/api/brandprofile/brandProfileUtils";
import { findManageableBrandProfile } from "@/lib/server/mongoose/helpers/brandProfiles";

export async function PUT(req, { params }) {
  const auth = await useServerAuth();
  if (!auth) {
    return NextResponse.json(resp("Unauthorized"), { status: 401 });
  }
  const { user } = auth;
  const { brandProfileId } = await params;
  const { name, iconUrl, backgroundUrl } = await req.json();

  const profile = await findManageableBrandProfile(user, brandProfileId);
  if (!profile) {
    return NextResponse.json(resp("brand profile not found"), { status: 404 });
  }

  if (name !== undefined) profile.name = name;

  try {
    const processed = await processAndUploadBrandProfileImages({
      iconUrl,
      backgroundUrl,
      brandProfileId,
    });

    profile.iconUrl = processed.iconUrl;
    profile.backgroundUrl = processed.backgroundUrl;
  } catch (e) {
    return NextResponse.json(resp(e.message), { status: 400 });
  }
  profile.lastUsed = new Date();
  await profile.save();

  return NextResponse.json(resp({ brandProfile: profile.toJsonAsClient() }));
}
