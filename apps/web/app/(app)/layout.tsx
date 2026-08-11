import type { ReactNode } from "react";
import TopBar from "../components/TopBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/20">
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-6">
        {children}
      </main>
    </div>
  );
}
