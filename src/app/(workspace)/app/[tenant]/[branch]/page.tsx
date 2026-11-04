import { redirect } from "next/navigation";

export default async function WorkspacePage({ params }: { params: Promise<{ tenant: string; branch: string }> }) {
  const { tenant, branch } = await params;
  redirect(`/app/${tenant}/${branch}/masalar`);
}
