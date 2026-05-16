import { redirect } from "next/navigation";
import DefaultLayout from "@/components/dashboard/DefaultLayout";
import { ROLES } from "@/lib/roles";
import { useServerAuth } from "@/lib/server/wrappers/auth";

export const metadata = {
  title: {
    template: "%s | Transfer.zip Admin",
    default: "Transfer.zip Admin",
  },
};

export default async function AdminLayout({ children }) {
  const auth = await useServerAuth();
  if (!auth) redirect("/signin");

  const { user } = auth;
  if (!user.hasTeam || (user.role !== ROLES.OWNER && user.role !== ROLES.ADMIN)) {
    redirect("/app");
  }

  return (
    <>
      <div
        aria-hidden
        className="grain fixed inset-0 -z-10 pointer-events-none bg-linear-to-b from-primary-700 to-primary-400"
      />
      <DefaultLayout>{children}</DefaultLayout>
    </>
  );
}
