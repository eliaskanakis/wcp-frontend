"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import type { Channel } from "@/types/channel";
import { isChannelAdmin } from "@/utils/channelAccess";

export default function ChannelsPage() {
  const { channels, loading } = useChannels();
  const { profile } = useAuth();

  const manageableChannels = useMemo(() => {
    if (profile?.globalAdmin) return channels;
    if (!profile) return [];
    return channels.filter((channel) => isChannelAdmin(channel, profile));
  }, [channels, profile]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        </p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          Rules per channel
        </h1>
        <p className="mt-2 text-sm text-slate-600">
        </p>
      </header>
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="hidden grid-cols-12 border-b border-slate-100 bg-slate-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span className="col-span-4">Channel</span>
          <span className="col-span-5">Description</span>
          <span className="col-span-1 text-center">Public</span>
          <span className="col-span-2 text-center">Actions</span>
        </div>
        {loading ? (
          <div className="px-6 py-6 text-center text-sm text-slate-500">
            Loading channels...
          </div>
        ) : manageableChannels.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-slate-500">
            No manageable channels available.
          </div>
        ) : (
          <ul>
            {manageableChannels.map((channel) => (
              <ChannelRow key={channel.id} channel={channel} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  return (
    <li className="border-t border-slate-100 px-6 py-4 text-sm text-slate-700">
      <div className="flex flex-col gap-3 sm:grid sm:grid-cols-12 sm:items-start sm:gap-0">
        <span className="font-semibold text-slate-900 sm:col-span-4">
          {channel.name}
        </span>
        <span className="text-slate-600 sm:col-span-5">
          {channel.description}
        </span>
        <span className="sm:col-span-1 sm:flex sm:justify-center">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:hidden">
          Public
        </span>
        <span className="rounded-full border border-slate-200 px-3 py-0.5 text-xs font-semibold text-slate-600">
          {channel.isPublic ? "Yes" : "No"}
        </span>
        </span>
        <span className="sm:col-span-2 sm:flex sm:justify-center">
          <Link
            href={`/setup/channels/${channel.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <CogIcon />
            Edit
          </Link>
        </span>
      </div>
    </li>
  );
}

function CogIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <g transform="scale(0.8) translate(3,3)">
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </g>
    </svg>
  );
}
