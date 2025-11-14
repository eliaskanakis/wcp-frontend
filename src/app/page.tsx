"use client";

import { useChannels } from "@/context/ChannelsContext";
import Link from "next/link";
import type { Channel } from "@/types/channel";

export default function Home() {
  const { channels, loading } = useChannels();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <section className="grid gap-6 md:grid-cols-2">
        {loading ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            No channels configured yet.
          </div>
        ) : (
          channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))
        )}
      </section>
    </div>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  return (
    <article
      id={`channel-${channel.id}`}
      className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">
          {channel.name}
        </h2>
        <Link
          href={`/setup/channels/${channel.id}`}
          className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          aria-label={`Configure ${channel.name}`}
        >
          <CogIcon />
          Configure
        </Link>
      </div>
      <p className="mt-4 text-sm text-slate-600">{channel.description}</p>
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
      <path d="M19.5 12a7.5 7.5 0 00-.155-1.519l1.648-1.27-1.5-2.598-1.97.507a7.536 7.536 0 00-2.16-1.246L15 4h-3l-.363 1.874a7.535 7.535 0 00-2.16 1.246l-1.97-.507-1.5 2.598 1.648 1.27A7.5 7.5 0 004.5 12c0 .514.053 1.016.155 1.519l-1.648 1.27 1.5 2.598 1.97-.507a7.536 7.536 0 002.16 1.246L12 20h3l.363-1.874a7.536 7.536 0 002.16-1.246l1.97.507 1.5-2.598-1.648-1.27c.102-.503.155-1.005.155-1.519z" />
      <circle cx="13.5" cy="12" r="1.5" />
    </svg>
  );
}
