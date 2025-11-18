"use client";

import { notFound, usePathname } from "next/navigation";
import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { useChannels } from "@/context/ChannelsContext";
import { db } from "@/lib/firebase";
import type { Channel, ChannelMember, ChannelRole } from "@/types/channel";

type ChannelPageProps = {
  params: Promise<{ channelId: string }>;
};

export default function ChannelDetailsPage({ params }: ChannelPageProps) {
  const resolvedParams = use(params);
  const { channels, refresh } = useChannels();
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
  const [isPublic, setIsPublic] = useState(Boolean(channel?.isPublic));
  const [members, setMembers] = useState<ChannelMember[]>(
    channel?.members ?? []
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<ChannelRole>("staff");

  useEffect(() => {
    if (!channel) {
      return;
    }
    setDescription(channel.description);
    setMaxUsers(Number(channel.rules?.maxUsers) || 0);
    setRecordingAllowed(Boolean(channel.rules?.recordingAllowed));
    setIsPublic(Boolean(channel.isPublic));
    setMembers(
      (channel.members ?? []).map((member) => ({
        ...member,
        isBlocked: Boolean(member.isBlocked),
      }))
    );
  }, [channel]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const snapshot = await getDocs(collection(db, "users"));
        const payload: UserOption[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as Partial<UserOption>;
          return {
            id: docSnap.id,
            email: data.email ?? "",
            name: data.name ?? data.email ?? docSnap.id,
          };
        });
        setUsers(payload);
      } catch (error) {
        console.error("Failed to load users list", error);
      } finally {
        setLoadingUsers(false);
      }
    };

    void fetchUsers();
  }, []);

  const breadcrumbs = useMemo(
    () => [
      { name: "Setup", href: "/setup/channels" },
      { name: "Rules per channel", href: "/setup/channels" },
      { name: channel?.name ?? resolvedParams.channelId, href: pathname },
    ],
    [channel?.name, resolvedParams.channelId, pathname]
  );

  const memberDetails = useMemo(() => {
    return members.map((member) => ({
      ...member,
      isBlocked: Boolean(member.isBlocked),
      user: users.find((user) => user.id === member.userId),
    }));
  }, [members, users]);

  const availableUsers = useMemo(() => {
    return users.filter(
      (user) => !members.some((member) => member.userId === user.id)
    );
  }, [members, users]);

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
        members,
        isPublic,
      };

      await updateDoc(channelDocRef, {
        items: channels.map((item) =>
          item.id === channel.id ? newChannelData : item
        ),
      });

      await refresh();
      setMessage("Changes saved successfully.");
    } catch (error) {
      console.error("Failed to save channel", error);
      setMessage("Unable to save changes. Try again later.");
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = (userId: string, role: ChannelRole) => {
    setMembers((prev) =>
      prev.map((member) =>
        member.userId === userId ? { ...member, role } : member
      )
    );
  };

  const handleRemoveMember = (userId: string) => {
    setMembers((prev) => prev.filter((member) => member.userId !== userId));
  };

  const handleAddMember = () => {
    if (!newMemberId) {
      setMessage("Select a user to add.");
      return;
    }
    if (members.some((member) => member.userId === newMemberId)) {
      setMessage("User already added.");
      return;
    }
    setMembers((prev) => [
      ...prev,
      { userId: newMemberId, role: newMemberRole },
    ]);
    setNewMemberId("");
    setNewMemberRole("staff");
    setMessage(null);
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
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Public Channel
              </label>
              <label className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  className="h-4 w-4 accent-slate-900"
                />
                Anyone can view
              </label>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Channel users
              </p>
              <span className="text-xs text-slate-500">
                {members.length} assigned
              </span>
            </div>
            {memberDetails.length === 0 ? (
              <p className="mt-3 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
                No users assigned yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {memberDetails.map((member) => (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <div className="flex flex-col text-sm text-slate-600 sm:w-1/3">
                      <span className="font-semibold text-slate-900">
                        {member.user?.name ?? "Unknown user"}
                      </span>
                      <span className="text-xs text-slate-500">
                        {member.user?.email ?? member.userId}
                      </span>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Role
                      </label>
                      <select
                        value={member.role}
                        onChange={(event) =>
                          handleRoleChange(
                            member.userId,
                            event.target.value as ChannelRole
                          )
                        }
                        className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="admin">Admin</option>
                        <option value="staff">Staff</option>
                        <option value="observer">Observer</option>
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                      <input
                        type="checkbox"
                        checked={member.isBlocked ?? false}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setMembers((prev) =>
                            prev.map((entry) =>
                              entry.userId === member.userId
                                ? { ...entry, isBlocked: checked }
                                : entry
                            )
                          );
                        }}
                        className="h-4 w-4 accent-rose-500"
                      />
                      Blocked
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.userId)}
                      className="text-sm font-semibold text-rose-600 transition hover:text-rose-500"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Add user
              </p>
              {loadingUsers ? (
                <p className="mt-3 text-sm text-slate-500">Loading users...</p>
              ) : availableUsers.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No available users to add.
                </p>
              ) : (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <select
                    value={newMemberId}
                    onChange={(event) => setNewMemberId(event.target.value)}
                    className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="">Select user</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                  <select
                    value={newMemberRole}
                    onChange={(event) =>
                      setNewMemberRole(event.target.value as ChannelRole)
                    }
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="admin">Admin</option>
                    <option value="staff">Staff</option>
                    <option value="observer">Observer</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddMember}
                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300"
                  >
                    Add
                  </button>
                </div>
              )}
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

type UserOption = {
  id: string;
  email: string;
  name: string;
};
