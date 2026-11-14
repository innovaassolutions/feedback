import { safeNextPath } from "@/lib/auth";
import { SignInCard } from "@/components/sign-in-card";

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : "/");
  const error = sp.error === "link" ? "That sign-in link has expired or was already used. Ask for a new one." : undefined;
  return <SignInCard title="Course Feedback Platform" logoPath={null} next={next} error={error} />;
}
