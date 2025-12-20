import React, { useEffect, useState } from "react";
import { Container } from "./Container";
import { Logo } from "./Logo";
import { Button } from "./generic/Button";
import clsx from "clsx";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
  }, [isMenuOpen]);

  return (
    <header
      className={clsx(
        "py-4 sticky top-0 z-40 bg-white/80 backdrop-blur-md mb-4 border-b transition-colors duration-1000",
        isScrolled ? "border-black/8" : "border-transparent"
      )}
    >
      <Container className="flex items-center justify-between">
        <div className="flex items-center gap-x-1.5 z-50 relative">
          <Logo className="text-gray-950 size-5" />
          <a href="/" className="text-lg/0 font-semibold text-gray-800">
            Lydie
          </a>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:block">
          <ul className="flex items-center text-[0.8125rem]/0 gap-x-2">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-gray-600 hover:text-black transition-colors font-medium px-2 py-1.5"
                >
                  {link.label}
                </a>
              </li>
            ))}
            {/* <li className="ml-2">
              <Button href="https://cloud.lydie.co/auth">Sign in</Button>
            </li> */}
          </ul>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden z-50 relative text-gray-600"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>

        {/* Mobile Navigation Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-white z-40 pt-24 px-6 md:hidden flex flex-col h-screen"
            >
              <nav className="flex flex-col gap-y-6">
                <ul className="flex flex-col gap-y-4 text-lg font-medium">
                  {links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="text-gray-900 block py-2"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
                {/* <div className="flex flex-col gap-y-3 pt-4 border-t border-gray-100">
                  <Button
                    href="https://cloud.lydie.co/auth"
                    size="lg"
                    className="w-full justify-center"
                  >
                    Sign in
                  </Button>
                </div> */}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </Container>
    </header>
  );
}
