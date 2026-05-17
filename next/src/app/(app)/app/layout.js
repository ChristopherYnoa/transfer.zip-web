import DashboardProvider from "@/context/DashboardContext";
import { redirect } from "next/navigation";
import { useServerAuth } from "@/lib/server/wrappers/auth";
import ApplicationProvider from "@/context/ApplicationContext";
import FloatingBar from "./FloatingBar";
import { FileProvider } from "@/context/FileProvider";
import { SelectedTransferProvider } from "@/context/SelectedTransferProvider";
import { IS_SELFHOST } from "@/lib/isSelfHosted";
import DismissibleBanner from "./DismissibleBanner";
import Link from "next/link";
import Image from "next/image";
import { ROLES } from "@/lib/roles";

import logo from "@/img/icon.png"

export const metadata = {
  title: {
    template: "%s | Dashboard",
    default: "Dashboard",
  },
};

export default async function DashboardLayout({ children }) {
  const auth = await useServerAuth();
  if (!auth) {
    return redirect("/signin");
  }

  if (auth.user.getPlan() == "free") {
    return redirect("/onboarding")
  }

  if (auth.user.hasTeam && auth.user.role === ROLES.OWNER && !auth.user.team.onboarded) {
    return redirect("/onboarding-team")
  }

  // const storage = await auth.user.getStorage()

  return (
    <div className="h-screen flex flex-col overflow-auto relative">
      <ApplicationProvider>
        <DashboardProvider>
          {children}
          <FloatingBar user={auth.user.toJsonAsClient()} />
        </DashboardProvider>
      </ApplicationProvider>
    </div>
  );
}
