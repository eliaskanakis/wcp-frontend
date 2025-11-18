"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import { auth } from "@/lib/firebase";

type ChatPageProps = {
  params: Promise<{ channelId: string }>;
};

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

type ChatMessage =
  | { type: 'system'; text: string; ts?: number }
  | { type: 'chat'; from: string; text: string; ts: number };

type OutboundMessage = {
  type: 'join' | 'chat';
  channelId: string;
  firebaseUserIdToken: string | null;
  from: string;
  text: string | null;
};

export default function ChannelChatPage({ params }: ChatPageProps) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const resolvedParams = use(params);
  const channelId = resolvedParams.channelId;
  const { channels, loading } = useChannels();
  const { profile } = useAuth();
  const senderName = profile?.name?.trim() || "Anonymous";
  const channel = channels.find(
    (item) => item.id === channelId
  );

  useEffect(() => {
    if (typeof window === 'undefined') return; // Only run in browser
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
  }, [channelId, senderName]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text) return;
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

  if (!channel) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-10 sm:px-6 lg:px-8">
        <p className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-600 shadow-sm">
          Channel not found.
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold tracking-wide text-slate-500">
          Chat room &ldquo;{channel.name}&rdquo;
          <span
            className={
              status === 'connected'
                ? 'text-green-600'
                : status === 'connecting'
                  ? 'text-yellow-600'
                  : 'text-red-600'
            }
          >
            {' ' + status}
          </span>
        </p>
      </header>
      <section className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        <div className="w-full max-w-xl flex flex-col gap-3">
          <div className="border rounded p-3 h-80 overflow-y-auto bg-gray-50">
            {messages.length === 0 && (
              <div className="text-gray-400 text-sm">
                No messages yet. Open this page in another tab and start chatting.
              </div>
            )}
            {messages.map((m, idx) => {
              const time =
                'ts' in m && m.ts
                  ? new Date(m.ts).toLocaleTimeString()
                  : '';
              if (m.type === 'system') {
                return (
                  <div key={idx} className="text-xs text-gray-500 mb-1">
                    [{time}] {m.text}
                  </div>
                );
              }
              return (
                <div key={idx} className="text-sm mb-1">
                  <span className="font-semibold">{m.from}:</span> {m.text}{' '}
                  <span className="text-[10px] text-gray-400">{time}</span>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder="Type a message and hit Enter"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
              onClick={() => {
                void sendMessage();
              }}
              disabled={status !== 'connected'}
            >
              Send
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function sendSocketPayload(socket: WebSocket | null, payload: OutboundMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
}
