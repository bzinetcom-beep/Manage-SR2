import { getCurrentUser } from "@/lib/auth";
import TopBarClient from "./TopBarClient";

export default async function TopBar() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <TopBarClient user={{ fullName: user.fullName, role: user.role }} />;
}
