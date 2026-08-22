"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppProvider } from "@/ui/AppProvider";
import { StaffFrame } from "@/ui/Shell";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <TooltipProvider>
        <AppProvider>
          <StaffFrame>{children}</StaffFrame>
          <Toaster position="top-right" className="no-print" />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
