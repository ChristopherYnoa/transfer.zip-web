import NewTransferFileUploadNew from "@/components/newtransfer/NewTransferFileUploadNew"
import { listBrandProfilesForUser } from "@/lib/server/brandProfiles"
import { useServerAuth } from "@/lib/server/wrappers/auth"

export default async function ConditionalLandingFileUpload({  }) {
  const auth = await useServerAuth()

  if (!auth || auth.user.getPlan() === "free") {
    return <NewTransferFileUploadNew loaded={true} />
  }

  const [storage, brandProfilesDocs] = await Promise.all([
    auth.user.getStorage(),
    listBrandProfilesForUser(auth.user),
  ])

  const brandProfiles = brandProfilesDocs.map(profile => profile.toJsonAsClient())

  return (
    <NewTransferFileUploadNew
      loaded={true}
      user={auth.user.toJsonAsClient()}
      storage={storage}
      brandProfiles={brandProfiles}
    />
  )
}
