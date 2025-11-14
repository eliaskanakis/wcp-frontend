"use client";

import { notFound, usePathname } from "next/navigation";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useChannels } from "@/context/ChannelsContext";
import { db } from "@/lib/firebase";
import type { Channel } from "@/types/channel";

type ChannelPageProps = {
  params: Promise<{ channelId: string }>;
};

export default function ChannelDetailsPage({ params }: ChannelPageProps) {
  const resolvedParams = use(params);
  const { channels } = useChannels();
  const pathname = usePathname();
  const channel =
    channels.find((item) => item.id === resolvedParams.channelId) ?? null;

  const [description, setDescription] = useState(channel?.description ?? "");
  const [maxUsers, setMaxUsers] = useState(
    Number(channel?.rules?.maxUsers) || 0
  );
  const [recordingAllowed, setRecordingAllowed] = useState(
    Boolean(channel?.rules?.recordingAllowed)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!channel) {
      return;
    }
    setDescription(channel.description);
    setMaxUsers(Number(channel.rules?.maxUsers) || 0);
    setRecordingAllowed(Boolean(channel.rules?.recordingAllowed));
  }, [channel]);

  const breadcrumbs = useMemo(
    () => [
      { name: "Setup", href: "/setup/channels" },
      { name: "Rules per channel", href: "/setup/channels" },
      { name: channel?.name ?? resolvedParams.channelId, href: pathname },
    ],
    [channel?.name, resolvedParams.channelId, pathname]
  );

  if (!channel) {
    if (channels.length === 0) {
      return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
            Loading channel...
          </p>
        </div>
      );
    }
    notFound();
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!channel) return;

    setSaving(true);
    setMessage(null);
    try {
      const channelDocRef = doc(db, "config", "channels");
      const updatedRules = {
        ...channel.rules,
        maxUsers,
        recordingAllowed,
      };

      const newChannelData: Channel = {
        ...channel,
        description,
        rules: updatedRules,
      };

      await updateDoc(channelDocRef, {
        items: channels.map((item) =>
          item.id === channel.id ? newChannelData : item
        ),
      });

      setMessage("Changes saved successfully.");
    } catch (error) {
      console.error("Failed to save channel", error);
      setMessage("Unable to save changes. Try again later.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <nav className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          {breadcrumbs.map((crumb, index) => (
            <li key={`${crumb.href}-${index}`} className="flex items-center gap-2">
              {index < breadcrumbs.length - 1 ? (
                <>
                  <Link
                    href={crumb.href}
                    className="font-medium text-slate-600 transition hover:text-slate-900"
                  >
                    {crumb.name}
                  </Link>
                  <span>/</span>
                </>
              ) : (
                <span className="font-semibold text-slate-900">
                  {crumb.name}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <header>
          <h1 className="text-3xl font-bold text-slate-900">
            Edit {channel?.name}
          </h1>
        <p className="mt-2 text-sm text-slate-600">
        </p>
      </header>
      <form
        onSubmit={handleSubmit}
        className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="space-y-5">
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="maxUsers"
                className="block text-sm font-medium text-slate-700"
              >
                Max Users
              </label>
              <input
                id="maxUsers"
                type="number"
                min={0}
                value={maxUsers}
                onChange={(event) =>
                  setMaxUsers(Number(event.target.value) || 0)
                }
                className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Recording Allowed
              </label>
              <label className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={recordingAllowed}
                  onChange={(event) => setRecordingAllowed(event.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                Enable
              </label>
            </div>
          </div>
        </div>
        {message && (
          <p className="mt-4 text-sm text-slate-600" role="status">
            {message}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Link
            href="/setup/channels"
            className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-slate-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
