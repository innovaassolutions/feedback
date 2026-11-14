import { logoUrl } from "@/lib/env";
import { Card, Notice } from "@/components/ui";
import { SignInForm } from "@/components/sign-in-form";

export function SignInCard({ title, logoPath, next, error }: { title: string; logoPath: string | null; next: string; error?: string }) {
  const logo = logoUrl(logoPath);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <Card className="space-y-5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={`${title} logo`} data-testid="sign-in-logo" className="h-12 w-auto self-start" />
        ) : null}
        <div>
          <h1 className="text-2xl font-semibold">Sign in</h1>
          <p className="mt-1 text-muted">{title}</p>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <SignInForm next={next} />
      </Card>
    </main>
  );
}
