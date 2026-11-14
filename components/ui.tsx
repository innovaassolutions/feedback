import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("rounded-theme border border-border bg-surface p-5", className)} {...props} />;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-theme px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed";
const variants = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-primary-soft",
  ghost: "text-primary hover:bg-primary-soft",
  danger: "border border-border bg-surface text-danger hover:bg-primary-soft",
} as const;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return <button className={cx(buttonBase, variants[variant], className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link className={cx(buttonBase, variants[variant], "no-underline", className)} {...props} />;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "primary" | "accent" | "success" | "danger" }) {
  const tones = {
    neutral: "border border-border text-muted",
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent text-on-accent",
    success: "border border-border text-success",
    danger: "border border-border text-danger",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      {hint ? <span className="ml-2 text-muted">{hint}</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export const inputClass =
  "w-full rounded-theme border border-border bg-surface px-3 py-2 text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary";

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" | "success" }) {
  const tones = { neutral: "text-muted", danger: "text-danger", success: "text-success" };
  return <p role={tone === "danger" ? "alert" : "status"} className={cx("rounded-theme border border-border bg-surface px-4 py-3 text-sm", tones[tone])}>{children}</p>;
}
