"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type NavLink = {
  title: string;
  href: string;
};

type NavSection = {
  label: string;
  links: NavLink[];
};

const channelLinks: NavLink[] = [
  { title: "Receiving", href: "#" },
  { title: "Picking", href: "#" },
  { title: "Packing", href: "#" },
  { title: "Shipping", href: "#" },
  { title: "Replenishment", href: "#" },
  { title: "Returns", href: "#" },
];

const setupLinks: NavLink[] = [
  { title: "Users", href: "#" },
  { title: "Rules per channel", href: "#" },
];

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const sections = useMemo<NavSection[]>(
    () => [
      { label: "Channels", links: channelLinks },
      { label: "Setup", links: setupLinks },
    ],
    []
  );

  const user = isAuthenticated ? { name: "Alex Rivera" } : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        sections={sections}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        user={user}
        onAuthToggle={() => setIsAuthenticated((prev) => !prev)}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-2xl bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Welcome
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Warehouse Coordination Platform
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Centralize every fulfillment channel with a single, responsive
            workspace. Use the menu to review operational flows, manage users,
            and adjust the rules that coordinate work on your floor.
          </p>
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          <QuickCard
            title="Monitor Channels"
            description="Track throughput across receiving, picking, packing, shipping, replenishment, and returns."
          />
          <QuickCard
            title="Configure Rules"
            description="Adjust routing logic, priorities, and staffing guidelines per workflow."
          />
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Header({
  sections,
  mobileMenuOpen,
  setMobileMenuOpen,
  user,
  onAuthToggle,
}: {
  sections: NavSection[];
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (next: boolean) => void;
  user: { name: string } | null;
  onAuthToggle: () => void;
}) {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <p className="text-lg font-semibold text-slate-900">
            Warehouse Coordination Platform
          </p>
          <nav className="hidden items-center gap-8 md:flex">
            {sections.map((section) => (
              <DesktopDropdown key={section.label} section={section} />
            ))}
            <Link
              href="#"
              className="text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              About
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-slate-700">{user.name}</span>
                <button
                  onClick={onAuthToggle}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={onAuthToggle}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Login
              </button>
            )}
            <button
              className="rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100 md:hidden"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <MenuIcon open={mobileMenuOpen} />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="flex flex-col gap-4 border-t border-slate-200 py-4 md:hidden">
            {sections.map((section) => (
              <MobileSection key={section.label} section={section} />
            ))}
            <Link
              href="#"
              className="text-sm font-medium text-slate-700 hover:text-slate-900"
              onClick={() => setMobileMenuOpen(false)}
            >
              About
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function DesktopDropdown({ section }: { section: NavSection }) {
  return (
    <div className="group relative">
      <button className="flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900">
        <span>{section.label}</span>
        <ChevronIcon />
      </button>
      <div className="invisible absolute left-0 top-full z-10 mt-3 w-48 rounded-xl border border-slate-100 bg-white p-3 text-sm opacity-0 shadow-lg transition duration-200 group-hover:visible group-hover:opacity-100">
        <ul className="space-y-2">
          {section.links.map((link) => (
            <li key={link.title}>
              <Link
                href={link.href}
                className="block rounded-md px-2 py-1 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              >
                {link.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MobileSection({ section }: { section: NavSection }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {section.label}
      </p>
      <ul className="mt-2 space-y-2">
        {section.links.map((link) => (
          <li key={link.title}>
            <Link
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {link.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <button className="mt-4 text-sm font-semibold text-slate-900 underline-offset-4 hover:underline">
        Explore
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>&copy; {new Date().getFullYear()} Warehouse Coordination Platform 0.1</p>
        <Link
          href="#"
          className="font-medium text-slate-600 transition hover:text-slate-900"
        >
          About
        </Link>
      </div>
    </footer>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-5 w-5"
      >
        <path
          fillRule="evenodd"
          d="M4.22 4.22a.75.75 0 011.06 0L10 8.94l4.72-4.72a.75.75 0 111.06 1.06L11.06 10l4.72 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 11-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 010-1.06z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.5"
      stroke="currentColor"
      className="h-5 w-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-4 w-4 text-slate-400"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}
