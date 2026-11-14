import { notFound } from "next/navigation";
import { getBranding } from "@/lib/branding";
import { safeNextPath } from "@/lib/auth";
import { SignInCard } from "@/components/sign-in-card";

export default async function OrgSignInPage({ params, searchParams }: PageProps<"/[org]/sign-in">) {
  const { org } = await params;
  const sp = await searchParams;
  const branding = await getBranding(org);
  if (!branding) notFound();
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : `/${org}`);
  const error = sp.error === "link" ? "That sign-in link has expired or was already used. Ask for a new one." : undefined;
  return <SignInCard title={branding.name} logoPath={branding.logo_path} next={next} error={error} />;
}
