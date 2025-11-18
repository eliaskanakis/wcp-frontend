"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import type { Channel } from "@/types/channel";
import { canViewChannel, isChannelAdmin } from "@/utils/channelAccess";

export default function Home() {
  const { channels, loading } = useChannels();
  const { profile } = useAuth();

  const accessibleChannels = useMemo(
    () => channels.filter((channel) => canViewChannel(channel, profile ?? null)),
    [channels, profile]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 md:grid-cols-2">
        {loading ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading channels...
          </div>
        ) : accessibleChannels.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            No accessible channels yet.
          </div>
        ) : (
          accessibleChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              canConfigure={isChannelAdmin(channel, profile ?? null)}
            />
          ))
        )}
      </section>
    </div>
  );
}

function ChannelCard({
  channel,
  canConfigure,
}: {
  channel: Channel;
  canConfigure: boolean;
}) {
  return (
    <article
      id={`channel-${channel.id}`}
      className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">
          {channel.name}
        </h2>
      </div>
      <p className="mt-4 text-sm text-slate-600">{channel.description}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/chat/${channel.id}`}
          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
        >
          Open Chat
        </Link>
        {canConfigure && (
          <Link
            href={`/setup/channels/${channel.id}`}
            className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <CogIcon />
            Configure
          </Link>
        )}
      </div>
    </article>
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
