import type { Metadata } from "next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import { source } from "@/lib/source";
import "./docs.css";

export const metadata: Metadata = {
  title: { template: "%s · User guide", default: "User guide" },
};

// Light and dark follow the system setting, as on every other page, so Fumadocs' own theme switch is off.
export default function Layout({ children }: LayoutProps<"/docs">) {
  return (
    <RootProvider theme={{ enabled: false }}>
      <div className="flex min-h-screen flex-col">
        <DocsLayout tree={source.getPageTree()} nav={{ title: "Course Feedback Platform" }} themeSwitch={{ enabled: false }}>
          {children}
        </DocsLayout>
      </div>
    </RootProvider>
  );
}
