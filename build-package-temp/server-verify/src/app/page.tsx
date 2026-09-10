import { redirect } from "next/navigation";
import { getServerAuthContext } from "@/lib/auth/server";

export default async function HomePage() {
  const context = await getServerAuthContext();
  redirect(context.user ? "/dashboard" : "/auth/login");
}
