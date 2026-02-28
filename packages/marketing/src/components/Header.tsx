import { DismissRegular, LineHorizontal3Regular as MenuRegular } from "@fluentui/react-icons";
import clsx from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { Container } from "./Container";
import { Button } from "./generic/Button";
import { Logo } from "./Logo";

const links = [
  {
    href: "/",
    label: "Home",
  },
  {
    href: "/blog",
    label: "Blog",
  },
  {
    href: "/pricing",
    label: "Pricing",
  },
  {
    href: "/roadmap",
    label: "Roadmap",
  },
];

export function Header() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const apiUrl = import.meta.env.PUBLIC_API_URL ?? "https://api.lydie.co";

  useEffect(() => {
    const controller = new AbortController();

    async function loadAuthState() {
      try {
        const cachedValue = window.sessionStorage.getItem("lydie:marketing:is-logged-in");
        if (cachedValue === "true") {
          setIsLoggedIn(true);
          return;
        }

        const response = await fetch(
          `${apiUrl}/internal/public/auth/get-session`,
          {
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { user?: unknown | null };
        const loggedIn = Boolean(payload?.user);

        setIsLoggedIn(loggedIn);

        if (loggedIn) {
          window.sessionStorage.setItem("lydie:marketing:is-logged-in", "true");
        }
      } catch {
        // ignore auth lookup failures
      }
    }

    loadAuthState();

    return () => {
      controller.abort();
    };
  }, [apiUrl]);

  const logoHref = isLoggedIn ? "/home" : "/";
  const authHref = isLoggedIn ? "https://app.lydie.co" : "https://app.lydie.co/auth";
  const authLabel = isLoggedIn ? "Go to app" : "Sign in";

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Prevent body scroll when menu is open by intercepting touch events
  useEffect(() => {
    if (!isMenuOpen) return;

    const preventScroll = (e: TouchEvent) => {
      // Only prevent if the touch is outside the mobile menu
      const menu = mobileMenuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        e.preventDefault();
      }
    };

    // Prevent scrolling on the body when menu is open
    document.addEventListener("touchmove", preventScroll, { passive: false });

    // Also prevent wheel events for desktop
    const preventWheel = (e: WheelEvent) => {
      const menu = mobileMenuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    document.addEventListener("wheel", preventWheel, { passive: false });

    return () => {
      document.removeEventListener("touchmove", preventScroll);
      document.removeEventListener("wheel", preventWheel);
    };
  }, [isMenuOpen]);

  // Trap focus in mobile menu when open
  useEffect(() => {
    if (!isMenuOpen) return;

    const menu = mobileMenuRef.current;
    if (!menu) return;

    const focusableElements = menu.querySelectorAll<HTMLElement>(
      'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])',
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Focus first element when menu opens
    firstFocusable?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <>
      {/* Skip Link for Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[60] focus:bg-white focus:text-gray-900 focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        Skip to main content
      </a>
      <header
        className={clsx(
          "w-full py-3 top-0 border-b transition-colors duration-400 sticky bg-grain bg-white! z-50",
          isScrolled ? "border-black/8" : "border-transparent",
        )}
      >
        <Container className="flex items-center justify-between">
          <a href={logoHref} className="flex items-center gap-x-1.5 z-50 relative focus:outline-none">
            <Logo className="text-gray-950 size-5" />
            <span className="text-lg/0 font-semibold text-gray-800">Lydie</span>
          </a>

          {/* Desktop Navigation */}
          <nav className="hidden md:block" aria-label="Main navigation">
            <ul className="flex items-center text-[0.8125rem]/0 gap-x-2">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-gray-600 hover:text-black transition-colors font-medium px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              <li className="ml-2">
                <Button href={authHref}>{authLabel}</Button>
              </li>
            </ul>
          </nav>

          {/* Mobile Menu Button */}
          <button
            ref={menuButtonRef}
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            className="md:hidden z-50 relative text-gray-600 p-2 -mr-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <DismissRegular className="size-6" aria-hidden="true" />
            ) : (
              <MenuRegular className="size-6" aria-hidden="true" />
            )}
          </button>

          {/* Mobile Navigation Overlay */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                ref={mobileMenuRef}
                id="mobile-menu"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2 }}
                className="fixed top-[60px] left-0 right-0 bottom-0 bg-white z-40 pt-6 px-6 md:hidden flex flex-col overflow-y-auto"
                role="dialog"
                aria-modal="true"
                aria-label="Mobile navigation"
              >
                <nav className="flex flex-col gap-y-6" aria-label="Mobile main navigation">
                  <ul className="flex flex-col gap-y-4 text-lg font-medium">
                    {links.map((link) => (
                      <li key={link.href}>
                        <a
                          href={link.href}
                          className="text-gray-900 block py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
                          onClick={() => setIsMenuOpen(false)}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </Container>
      </header>
    </>
  );
}
