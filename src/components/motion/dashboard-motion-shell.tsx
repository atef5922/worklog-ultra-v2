"use client";

import { useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function DashboardMotionShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const scopeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReducedMotion || !scopeRef.current) {
      return;
    }

    const scope = scopeRef.current;
    const floats = scope.querySelectorAll<HTMLElement>("[data-dashboard-float='soft']");

    if (!floats.length) {
      return;
    }

    const context = gsap.context(() => {
      gsap.to(floats, {
        y: -5,
        duration: 2.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
        stagger: 0.16,
      });
    }, scope);

    return () => context.revert();
  }, [pathname, prefersReducedMotion]);

  return (
    /*
     * The panel entrance is CSS (`dashboard-rise` in globals.css), not GSAP or
     * framer. Hiding server-rendered markup until hydration ran left the page
     * blank on every reload; CSS animates from the first paint instead. The key
     * still remounts this on navigation so the entrance replays per route.
     *
     * Hugs its content by default so anything rendered after it (task monitor)
     * sits right below. A page that wants the whole viewport opts in with
     * `data-fit-viewport`, which `.dashboard-shell` picks up in globals.css.
     */
    <div className="dashboard-shell" key={pathname} ref={scopeRef}>
      {children}
    </div>
  );
}
