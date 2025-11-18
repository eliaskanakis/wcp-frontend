"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import { auth, db } from "@/lib/firebase";
import { canViewChannel, isChannelAdmin } from "@/utils/channelAccess";

type ChatPageProps = {
  params: Promise<{ channelId: string }>;
};

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

type ChatMessage =
  | { type: "system"; text: string; ts?: number }
  | { type: "systemError"; text: string; ts?: number }
  | { type: "chat"; from: string; text: string; ts: number };

type RosterUser = {
  userId: string;
  username: string;
};

type OutboundMessage = {
  type: "join" | "chat" | "fetch-history";
  channelId: string;
  firebaseUserIdToken: string | null;
  from: string;
  text: string | null;
  beforeTs?: number;
};

export default function ChannelChatPage({ params }: ChatPageProps) {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [rosterOpen, setRosterOpen] = useState(true);
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const oldestMessageTsRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const pendingHistoryRef = useRef<{ pending: boolean; prevHeight: number }>({
    pending: false,
    prevHeight: 0,
  });

  const resolved = use(params);
  const channelId = resolved.channelId;
  const { channels, loading, refresh } = useChannels();
  const { profile } = useAuth();
  const senderName = profile?.name?.trim() || "Anonymous";
  const channel = channels.find((item) => item.id === channelId);
  const canView = channel ? canViewChannel(channel, profile ?? null) : false;
  const isAdmin = channel ? isChannelAdmin(channel, profile ?? null) : false;

  const sendSocketPayload = useCallback((payload: OutboundMessage) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !canView) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = async () => {
      setStatus("connected");
      let token: string | null = null;
      if (auth.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
        } catch (error) {
          console.error("Failed to fetch user token", error);
        }
      }
      sendSocketPayload({
        type: "join",
        channelId,
        from: senderName,
        firebaseUserIdToken: token,
        text: null,
      });
    };
    ws.onclose = () => setStatus("disconnected");
    ws.onerror = () => setStatus("disconnected");
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "system") {
          setMessages((prev) => [
            ...prev,
            { type: "system", text: msg.text, ts: msg.ts ?? Date.now() },
          ]);
        } else if (msg.type === "error") {
          setStatus("error");
          setMessages((prev) => [
            ...prev,
            {
              type: "systemError",
              text: `Error: ${msg.text ?? "Unknown error"}`,
              ts: msg.ts ?? Date.now(),
            },
          ]);
        } else if (msg.type === "chat") {
          setMessages((prev) => [
            ...prev,
            {
              type: "chat",
              from: msg.from,
              text: msg.text,
              ts: msg.ts ?? Date.now(),
            },
          ]);
        } else if (msg.type === "channel-history") {
          const nextMessages =
            Array.isArray(msg.messages) && msg.messages.length > 0
              ? [...msg.messages]
                  .map(
                    (item: {
                      text: string;
                      from: string;
                      ts: number;
                      type: string;
                    }) => ({
                      type: "chat" as const,
                      text: item.text,
                      from: item.from,
                      ts: item.ts,
                    })
                  )
                  .sort((a, b) => a.ts - b.ts)
              : [];
          setMessages((prev) => [...nextMessages, ...prev]);
          if (nextMessages.length > 0) {
            oldestMessageTsRef.current =
              nextMessages[0].ts;
          }
          setHistoryLoaded(true);
        } else if (msg.type === "channel-users") {
          setRoster(
            Array.isArray(msg.users)
              ? msg.users.map((user: RosterUser) => ({
                  userId: user.userId,
                  username: user.username,
                }))
              : []
          );
        } else if (msg.type === "user-joined") {
          setRoster((prev) => {
            if (prev.some((user) => user.userId === msg.userId)) {
              return prev;
            }
            return [
              ...prev,
              { userId: msg.userId, username: msg.username },
            ];
          });
        } else if (msg.type === "user-left") {
          setRoster((prev) =>
            prev.filter((user) => user.userId !== msg.userId)
          );
        }
      } catch (error) {
        console.error("Invalid websocket payload", error);
      }
    };
    return () => {
      ws.close();
    };
  }, [canView, channelId, senderName, sendSocketPayload]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    if (pendingHistoryRef.current.pending) {
      const delta =
        container.scrollHeight - pendingHistoryRef.current.prevHeight;
      container.scrollTop = delta;
      pendingHistoryRef.current.pending = false;
      return;
    }
    if (!stickToBottomRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleHistoryRequest = useCallback(() => {
    if (!historyLoaded || !oldestMessageTsRef.current) {
      return;
    }
    sendSocketPayload({
      type: "fetch-history",
      channelId,
      from: senderName,
      firebaseUserIdToken: null,
      text: null,
      beforeTs: oldestMessageTsRef.current,
    });
  }, [channelId, historyLoaded, sendSocketPayload, senderName]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    const handleScroll = () => {
      if (container.scrollTop === 0) {
        if (!pendingHistoryRef.current.pending) {
          pendingHistoryRef.current = {
            pending: true,
            prevHeight: container.scrollHeight,
          };
        }
        handleHistoryRequest();
      }
      const distanceFromBottom =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      stickToBottomRef.current = distanceFromBottom < 80;
    };
    container.addEventListener("scroll", handleScroll);
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleHistoryRequest]);

  const handleRemoveUser = useCallback(
    async (userId: string) => {
      if (!channel || !profile) return;
      if (!isAdmin) return;
      try {
        const updatedMembers =
          channel.members?.map((member) =>
            member.userId === userId ? { ...member, isBlocked: true } : member
          ) ?? [];
        const channelDocRef = doc(db, "config", "channels");
        await updateDoc(channelDocRef, {
          items: channels.map((item) =>
            item.id === channel.id
              ? { ...item, members: updatedMembers }
              : item
          ),
        });
        await refresh();
        setMessages((prev) => [
          ...prev,
          {
            type: "system",
            text: `Blocked user ${userId}`,
            ts: Date.now(),
          },
        ]);
      } catch (error) {
        console.error("Failed to block user", error);
        setMessages((prev) => [
          ...prev,
          {
            type: "systemError",
            text: "Unable to block this user. Try again later.",
            ts: Date.now(),
          },
        ]);
      }
    },
    [channel, channels, isAdmin, profile, refresh]
  );

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || !canView) return;
    let token: string | null = null;
    if (auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (error) {
        console.error("Failed to fetch user token", error);
      }
    }
    sendSocketPayload({
      type: "chat",
      channelId,
      firebaseUserIdToken: token,
      from: senderName,
      text,
    });
    setInput("");
  }, [canView, channelId, input, sendSocketPayload, senderName]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
          Loading channel...
        </p>
      </div>
    );
  }

  if (!channel || !canView) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600 shadow-sm">
          You do not have access to this channel.
        </p>
        <Link
          href="/"
          className="text-center text-sm font-semibold text-slate-900 underline-offset-4 hover:underline"
        >
          Go back home
        </Link>
      </div>
    );
  }

  const statusBadgeClass =
    status === "connected"
      ? "bg-emerald-100 text-emerald-700"
      : status === "connecting"
        ? "bg-amber-100 text-amber-700"
        : status === "error"
          ? "bg-rose-200 text-rose-800"
          : "bg-rose-100 text-rose-700";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white/90 px-4 py-3 text-sm shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Channel chat
        </p>
        <h1 className="flex-1 text-lg font-bold text-slate-900">
          {channel.name}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}
        >
          {status}
        </span>
        <button
          onClick={() => setRosterOpen((prev) => !prev)}
          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
        >
          {rosterOpen ? "Hide Participants" : "Show Participants"}
        </button>
      </header>
      <section className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row">
        <div className="flex-1 space-y-3">
          <div
            ref={messagesRef}
            className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 md:h-[450px] md:overflow-y-auto"
          >
            {messages.length === 0 && (
              <div className="text-center text-sm text-slate-400">
                No messages yet. Start the conversation!
              </div>
            )}
            {messages.map((message, idx) => {
              const time =
                "ts" in message && message.ts
                  ? new Date(message.ts).toLocaleTimeString()
                  : "";
              if (message.type === "system" || message.type === "systemError") {
                const isError = message.type === "systemError";
                return (
                  <div
                    key={idx}
                    className={`mx-auto w-full max-w-md rounded-2xl border border-dashed p-3 text-center text-xs font-semibold ${
                      isError
                        ? "border-rose-200 bg-rose-50/80 text-rose-700"
                        : "border-slate-200 bg-white/80 text-slate-500"
                    }`}
                  >
                    [{time}] {message.text}
                  </div>
                );
              }
              const isOwn = message.from === senderName;
              return (
                <div
                  key={idx}
                  className={`flex ${
                    isOwn ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`w-full max-w-md rounded-2xl p-4 shadow-sm ${
                      isOwn
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold ${
                          isOwn ? "text-white/80" : "text-slate-500"
                        }`}
                      >
                        {message.from}
                      </span>
                      <span
                        className={isOwn ? "text-white/60" : "text-slate-400"}
                      >
                        {time}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{message.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 text-sm shadow-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              placeholder="Type a message and hit Enter"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={() => {
                void sendMessage();
              }}
              disabled={status !== "connected"}
            >
              Send
            </button>
          </div>
        </div>
        <aside
          className={`rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600 ${
            rosterOpen ? "block md:block" : "hidden md:hidden"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Active users
            </p>
            <span className="text-xs font-semibold text-slate-400">
              {roster.length}
            </span>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {roster.length > 0 ? (
              roster.map((user) => (
                <li
                  key={user.userId}
                  className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">
                      {user.username}
                    </p>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          void handleRemoveUser(user.userId);
                        }}
                        className="rounded-full border border-rose-100 px-3 py-1 text-xs font-semibold text-rose-500 transition hover:border-rose-200 hover:text-rose-600"
                      >
                        Block
                      </button>
                    )}
                  </div>
                </li>
              ))
            ) : (
              <li className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-center text-xs text-slate-400">
                No active users
              </li>
            )}
          </ul>
        </aside>
      </section>
    </div>
  );
}
