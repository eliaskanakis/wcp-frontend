"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import { canViewChannel, isChannelAdmin } from "@/utils/channelAccess";

type NavLink = {
  title: string;
  href: string;
};

type NavSection = {
  label: string;
  links: NavLink[];
};

type HeaderUser = {
  name: string;
  globalAdmin: boolean;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { channels, loading: channelsLoading } = useChannels();
  const { profile, loading: authLoading, logout } = useAuth();

  const accessibleChannels = useMemo(
    () =>
      channels.filter((channel) => canViewChannel(channel, profile ?? null)),
    [channels, profile]
  );

  const canManageChannels = useMemo(
    () =>
      Boolean(
        profile?.globalAdmin ||
          channels.some((channel) => isChannelAdmin(channel, profile ?? null))
      ),
    [channels, profile]
  );

  const setupLinks = useMemo<NavLink[]>(() => {
    const links: NavLink[] = [{ title: "Users", href: "/setup/users" }];
    if (canManageChannels) {
      links.push({ title: "Rules per channel", href: "/setup/channels" });
    }
    return links;
  }, [canManageChannels]);

  const sections = useMemo<NavSection[]>(
    () => [
      {
        label: "Channels",
        links:
          accessibleChannels.length > 0
            ? accessibleChannels.map((channel) => ({
                title: channel.name,
                href: `/chat/${channel.id}`,
              }))
            : [
                {
                  title: channelsLoading
                    ? "Loading..."
                    : "No accessible channels",
                  href: "#",
                },
              ],
      },
      { label: "Setup", links: setupLinks },
    ],
    [accessibleChannels, channelsLoading, setupLinks]
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <Header
        sections={sections}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        user={
          profile ? { name: profile.name, globalAdmin: profile.globalAdmin } : null
        }
        authLoading={authLoading}
        onLogout={async () => {
          await logout();
          setMobileMenuOpen(false);
        }}
      />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Header({
  sections,
  mobileMenuOpen,
  setMobileMenuOpen,
  user,
  authLoading,
  onLogout,
}: {
  sections: NavSection[];
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (next: boolean) => void;
  user: HeaderUser | null;
  authLoading: boolean;
  onLogout: () => Promise<void>;
}) {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between py-4">
          <Link
            href="/"
            className="text-lg font-semibold text-slate-900 transition hover:text-slate-600"
          >
            Warehouse Coordination Platform
          </Link>
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
            {authLoading ? (
              <span className="h-10 w-28 animate-pulse rounded-full bg-slate-200" />
            ) : user ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-slate-700">
                  {user.name}
                  {user.globalAdmin ? " (Admin)" : ""}
                </span>
                <button
                  onClick={() => {
                    void onLogout();
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Login
              </Link>
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
            {!authLoading && (
              <div>
                {user ? (
                  <button
                    onClick={() => {
                      void onLogout();
                    }}
                    className="w-full rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Logout
                  </button>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block w-full rounded-full bg-slate-900 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
                  >
                    Login
                  </Link>
                )}
              </div>
            )}
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
      <div className="pointer-events-auto absolute left-0 top-full z-10 h-3 w-full" aria-hidden />
      <div className="invisible absolute left-0 top-full z-20 mt-3 w-48 rounded-xl border border-slate-100 bg-white p-3 text-sm opacity-0 shadow-lg transition duration-200 group-hover:visible group-hover:opacity-100">
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
