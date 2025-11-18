"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import { auth } from "@/lib/firebase";
import { canViewChannel } from "@/utils/channelAccess";

type ChatPageProps = {
  params: Promise<{ channelId: string }>;
};

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

type ChatMessage =
  | { type: "system"; text: string; ts?: number }
  | { type: "systemError"; text: string; ts?: number }
  | { type: "chat"; from: string; text: string; ts: number };

type OutboundMessage = {
  type: 'join' | 'chat';
  channelId: string;
  firebaseUserIdToken: string | null;
  from: string;
  text: string | null;
};

export default function ChannelChatPage({ params }: ChatPageProps) {
  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [rosterOpen, setRosterOpen] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const resolvedParams = use(params);
  const channelId = resolvedParams.channelId;
  const { channels, loading } = useChannels();
  const { profile } = useAuth();
  const senderName = profile?.name?.trim() || "Anonymous";
  const channel = channels.find((item) => item.id === channelId);
  const canView = channel ? canViewChannel(channel, profile ?? null) : false;

  useEffect(() => {
    if (typeof window === 'undefined' || !canView) return; // Only run in browser
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = async () => {
      setStatus('connected');
      let token: string | null = null;
      if (auth.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
        } catch (error) {
          console.error('Failed to fetch user token', error);
        }
      }
      sendSocketPayload(ws, {
        type: 'join',
        channelId,
        firebaseUserIdToken: token,
        from: senderName,
        text: null,
      });
    };
    ws.onclose = () => {
      setStatus('disconnected');
    };
    ws.onerror = () => {
      setStatus('disconnected');
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'system') {
          setMessages((prev) => [
            ...prev,
            { type: 'system', text: msg.text, ts: msg.ts ?? Date.now() },
          ]);
        } else if (msg.type === 'error') {
          setStatus("error");
          setMessages((prev) => [
            ...prev,
            {
              type: 'systemError',
              text: `Error: ${msg.text ?? "Unknown error"}`,
              ts: msg.ts ?? Date.now(),
            },
          ]);
        } else if (msg.type === 'chat') {
          setMessages((prev) => [
            ...prev,
            {
              type: 'chat',
              from: msg.from,
              text: msg.text,
              ts: msg.ts ?? Date.now(),
            },
          ]);
        }
      } catch (e) {
        console.error('Invalid message', e);
      }
    };

    // cleanup on unmount
    return () => {
      ws.close();
    };
  }, [canView, channelId, senderName]);

  useEffect(() => {
    if (!messagesRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !canView) return;
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    let token: string | null = null;
    if (auth.currentUser) {
      try {
        token = await auth.currentUser.getIdToken();
      } catch (error) {
        console.error('Failed to fetch user token', error);
      }
    }

    sendSocketPayload(socket, {
      type: 'chat',
      channelId,
      firebaseUserIdToken: token,
      from: senderName,
      text,
    });

    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
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
            {messages.map((m, idx) => {
              const time =
                "ts" in m && m.ts ? new Date(m.ts).toLocaleTimeString() : "";
              if (m.type === "system" || m.type === "systemError") {
                const isError = m.type === "systemError";
                return (
                  <div
                    key={idx}
                    className={`mx-auto w-full max-w-md rounded-2xl border border-dashed p-3 text-center text-xs font-semibold ${
                      isError
                        ? "border-rose-200 bg-rose-50/80 text-rose-700"
                        : "border-slate-200 bg-white/80 text-slate-500"
                    }`}
                  >
                    [{time}] {m.text}
                  </div>
                );
              }
              const isOwn = m.from === senderName;
              return (
                <div
                  key={idx}
                  className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
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
                        {m.from}
                      </span>
                      <span
                        className={isOwn ? "text-white/60" : "text-slate-400"}
                      >
                        {time}
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{m.text}</p>
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
              onChange={(e) => setInput(e.target.value)}
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
            <span className="text-xs font-semibold text-slate-400">2</span>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
              <p className="font-semibold text-slate-900">Fake user 1</p>
              <p className="text-xs text-slate-500">Warehouse Floor</p>
            </li>
            <li className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm">
              <p className="font-semibold text-slate-900">Fake user 2</p>
              <p className="text-xs text-slate-500">Supervisor</p>
            </li>
          </ul>
        </aside>
      </section>
    </div>
  );
}

function sendSocketPayload(socket: WebSocket | null, payload: OutboundMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}
