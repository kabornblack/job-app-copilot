import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthCardProps = {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
};

/** Shared centered-card shell for /login and /signup. */
export default function AuthCard({
  title,
  description,
  footer,
  children,
}: AuthCardProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12">
      <div className="mb-6 text-sm font-semibold tracking-wide text-muted-foreground">
        JOB APPLICATION COPILOT
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      <p className="mt-4 text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}
