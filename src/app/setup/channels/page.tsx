"use client";

import Link from "next/link";
import { useChannels } from "@/context/ChannelsContext";
import type { Channel } from "@/types/channel";

export default function ChannelsPage() {
  const { channels, loading } = useChannels();

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
        <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50/60 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span className="col-span-4">Channel</span>
          <span className="col-span-6">Description</span>
          <span className="col-span-2 text-center">Actions</span>
        </div>
        {loading ? (
          <div className="px-6 py-6 text-center text-sm text-slate-500">
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-slate-500">
            No channels configured yet.
          </div>
        ) : (
          <ul>
            {channels.map((channel) => (
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
    <li className="grid grid-cols-12 items-start gap-3 border-t border-slate-100 px-6 py-4 text-sm text-slate-700">
      <span className="col-span-4 font-semibold text-slate-900">
        {channel.name}
      </span>
      <span className="col-span-6 text-slate-600">{channel.description}</span>
      <span className="col-span-2 flex justify-center">
        <Link
          href={`/setup/channels/${channel.id}`}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          <CogIcon />
          Edit
        </Link>
      </span>
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
      className="h-4 w-4"
    >
      <path d="M19.5 12a7.5 7.5 0 00-.155-1.519l1.648-1.27-1.5-2.598-1.97.507a7.536 7.536 0 00-2.16-1.246L15 4h-3l-.363 1.874a7.535 7.535 0 00-2.16 1.246l-1.97-.507-1.5 2.598 1.648 1.27A7.5 7.5 0 004.5 12c0 .514.053 1.016.155 1.519l-1.648 1.27 1.5 2.598 1.97-.507a7.536 7.536 0 002.16 1.246L12 20h3l.363-1.874a7.536 7.536 0 002.16-1.246l1.97.507 1.5-2.598-1.648-1.27c.102-.503.155-1.005.155-1.519z" />
      <circle cx="13.5" cy="12" r="1.5" />
    </svg>
  );
}
