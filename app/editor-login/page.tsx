import { getAppUser } from "@/app/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function EditorLoginPage() {
  if (await getAppUser()) redirect("/?editor=1");
  redirect("/login?return_to=%2F%3Feditor%3D1");
}
