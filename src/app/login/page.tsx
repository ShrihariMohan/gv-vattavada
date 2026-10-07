"use client";

import { useApp } from "@/ui/AppProvider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo } from "@/ui/brand";

export default function LoginPage() {
  const { ready, user, login } = useApp();
  const router = useRouter();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/dashboard");
  }, [ready, user, router]);

  if (!ready) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[var(--pwa-background,#f3f7f8)] px-6">
        <BrandLogo height={72} className="max-h-[72px]" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,color-mix(in_oklch,var(--primary)_28%,transparent),transparent_42%),radial-gradient(circle_at_90%_0%,color-mix(in_oklch,var(--accent)_45%,transparent),transparent_38%)]" />
      <Card className="relative w-full max-w-sm shadow-lg">
        <CardHeader>
          <BrandLogo height={56} className="mx-auto mb-2 max-h-14" />
          <CardTitle className="text-center">Staff console</CardTitle>
          <CardDescription className="text-center">G.V Royal Residency · G.V Cloudy Glenn · G.V Cloudy Kitchen</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              try {
                login(String(fd.get("username")), String(fd.get("password")));
                setError("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Login failed");
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" autoComplete="username" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className="pr-9"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="mt-1 w-full">
              Sign in
            </Button>
            <Link href="/" className="text-center text-xs text-primary underline-offset-4 hover:underline">
              Back to public sites
            </Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
