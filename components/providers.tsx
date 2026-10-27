"use client";

import { useEffect, useState } from "react";
import { ThemeProvider, theme } from "@material-tailwind/react";

/**
 * Mount the Material Tailwind theme provider on the client only.
 *
 * The v3 beta ThemeProvider currently throws "Maximum call stack size exceeded"
 * when it participates in Next.js 15 development SSR. Deferring it until after
 * hydration keeps the app usable while retaining the provider for client-side
 * theming.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return <ThemeProvider value={theme}>{children}</ThemeProvider>;
}
