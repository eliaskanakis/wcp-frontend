"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useChannels } from "@/context/ChannelsContext";
import { auth, db } from "@/lib/firebase";
import { canViewChannel, isChannelAdmin } from "@/utils/channelAccess";
import { usePeerConnection } from "@/hooks/usePeerConnection";
import { CallPanel } from "@/components/CallPanel";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000";

type ChatMessage =
  | { type: "system"; text: string; ts?: number }
  | { type: "systemError"; text: string; ts?: number }
  | { type: "chat"; from: string; text: string; ts: number };

type RosterUser = {
  userId: string;
  username: string;
};

type OutboundMessageType =
  | "join"
  | "chat"
  | "fetch-history"
  | "webrtc-offer"
  | "webrtc-answer"
  | "webrtc-ice"
  | "call-cancelled"
  | "call-rejected"
  | "call-ended";

type OutboundMessage = {
  type: OutboundMessageType;
  channelId: string;
  from: string;
  firebaseUserIdToken: string | null;
  text: string | null;
  beforeTs?: number;
  targetUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
  reason?: string;
};

type IncomingCall = {
  fromUserId: string;
  fromName: string;
  sdp: RTCSessionDescriptionInit;
};

type ActiveCall = {
  userId: string;
  username: string;
};

export default function ChannelChatPage({
  params,
}: {
  params: Promise<{ channelId: string }>;
}) {
  const resolved = use(params);
  const channelId = resolved.channelId;

  const { channels, loading, refresh } = useChannels();
  const { profile } = useAuth();

  const senderName = profile?.name?.trim() || "Anonymous";
  const currentUserId = profile?.uid ?? null;
  const channel = channels.find((item) => item.id === channelId);
  const canView = channel ? canViewChannel(channel, profile ?? null) : false;
  const isAdmin = channel ? isChannelAdmin(channel, profile ?? null) : false;

  const [status, setStatus] = useState<
    "connecting" | "connected" | "disconnected" | "error"
  >("connecting");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [rosterOpen, setRosterOpen] = useState(true);
  const [roster, setRoster] = useState<RosterUser[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<ActiveCall | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const oldestMessageTsRef = useRef<number | null>(null);
  const pendingHistoryRef = useRef<{ pending: boolean; prevHeight: number }>({
    pending: false,
    prevHeight: 0,
  });
  const stickToBottomRef = useRef(true);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushSystemMessage = useCallback((text: string, isError = false) => {
    setMessages((prev) => [
      ...prev,
      {
        type: isError ? "systemError" : "system",
        text,
        ts: Date.now(),
      },
    ]);
  }, []);

  const sendSocketPayload = useCallback((payload: OutboundMessage) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
  }, []);

  const signalSender = useCallback(
    (payload: {
      type: string;
      channelId: string;
      from: string;
      firebaseUserIdToken: string | null;
      text?: string | null;
      targetUserId?: string;
      sdp?: RTCSessionDescriptionInit;
      ice?: RTCIceCandidateInit;
    }) => {
      sendSocketPayload({
        type: payload.type as OutboundMessageType,
        channelId: payload.channelId,
        from: payload.from,
        firebaseUserIdToken: payload.firebaseUserIdToken,
        text: payload.text ?? null,
        targetUserId: payload.targetUserId,
        sdp: payload.sdp,
        ice: payload.ice,
      });
    },
    [sendSocketPayload]
  );

  const {
    createOffer,
    acceptOffer,
    handleAnswer,
    handleRemoteIce,
    endCall: endPeerConnection,
    state: peerState,
    toggleMuteRemote,
    toggleMuteSelf,
  } = usePeerConnection({
    channelId,
    currentName: senderName,
    sendSignal: signalSender,
    onError: (message) => pushSystemMessage(message, true),
    onPeerEvent: (event, detail) => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[RTC]", event, detail);
      }
    },
  });

  const clearIncomingTimer = () => {
    if (incomingTimerRef.current) {
      clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = null;
    }
  };

  const clearOutgoingTimer = () => {
    if (outgoingTimerRef.current) {
      clearTimeout(outgoingTimerRef.current);
      outgoingTimerRef.current = null;
    }
  };

  const resetCallState = useCallback(() => {
    clearIncomingTimer();
    clearOutgoingTimer();
    setIncomingCall(null);
    setOutgoingCall(null);
    setActiveCall(null);
    endPeerConnection();
  }, [endPeerConnection]);

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
    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "system") {
          pushSystemMessage(msg.text);
        } else if (msg.type === "error") {
          setStatus("error");
          pushSystemMessage(msg.text ?? "Unknown error", true);
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
                  .sort((a, b) => b.ts - a.ts)
              : [];
          setMessages((prev) => [...nextMessages, ...prev]);
          if (nextMessages.length > 0) {
            oldestMessageTsRef.current =
              nextMessages[nextMessages.length - 1].ts;
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
            if (prev.some((user) => user.userId === msg.userId)) return prev;
            return [...prev, { userId: msg.userId, username: msg.username }];
          });
        } else if (msg.type === "user-left") {
          setRoster((prev) =>
            prev.filter((user) => user.userId !== msg.userId)
          );
        } else if (msg.type === "webrtc-ice" && msg.ice) {
          await handleRemoteIce(msg.ice);
        } else if (msg.type === "webrtc-answer" && msg.sdp) {
          await handleAnswer(msg.sdp);
          clearOutgoingTimer();
          setActiveCall(
            (prev) => prev ?? { userId: msg.userId, username: msg.from }
          );
          setOutgoingCall(null);
          pushSystemMessage(`Connected with ${msg.from}.`);
        } else if (msg.type === "webrtc-offer" && msg.sdp) {
          if (msg.targetUserId && msg.targetUserId !== currentUserId) {
            return;
          }
          resetCallState();
          const callerId = msg.userId;
          const callerName = msg.from;
          setIncomingCall({
            fromUserId: callerId,
            fromName: callerName,
            sdp: msg.sdp,
          });
          pushSystemMessage(`${callerName} is calling you...`);
          clearIncomingTimer();
          incomingTimerRef.current = setTimeout(() => {
            sendSocketPayload({
              type: "call-rejected",
              channelId,
              from: senderName,
              firebaseUserIdToken: null,
              text: null,
              targetUserId: callerId,
              reason: "timeout",
            });
            pushSystemMessage(`Missed call from ${callerName}.`, true);
            setIncomingCall((current) =>
              current && current.fromUserId === callerId ? null : current
            );
            endPeerConnection();
          }, 15000);
        } else if (msg.type === "call-cancelled") {
          pushSystemMessage(`${msg.from} cancelled the call.`);
          resetCallState();
        } else if (msg.type === "call-rejected") {
          pushSystemMessage(`${msg.from} rejected the call.`);
          resetCallState();
        } else if (msg.type === "call-ended") {
          pushSystemMessage(`${msg.from} ended the call.`);
          resetCallState();
        }
      } catch (error) {
        console.error("Invalid websocket payload", error);
      }
    };
    return () => {
      console.log(senderName+" disconnected due to dismount");
      ws.close();
    };
  }, [
    canView,
    channelId,
    currentUserId,
    endPeerConnection,
    handleAnswer,
    handleRemoteIce,
    incomingCall,
    pushSystemMessage,
    resetCallState,
    sendSocketPayload,
    senderName,
  ]);

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
    async (userId: string, name: string) => {
      if (!channel || !isAdmin) return;
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
        pushSystemMessage(`${name} was blocked.`);
      } catch (error) {
        console.error("Failed to block user", error);
        pushSystemMessage("Unable to block user.", true);
      }
    },
    [channel, channels, isAdmin, pushSystemMessage, refresh]
  );

  const initiateCall = useCallback(
    async (targetUserId: string, targetName: string) => {
      if (activeCall || outgoingCall) {
        pushSystemMessage("You already have a pending or active call.", true);
        return;
      }
      endPeerConnection();
      try {
        const offer = await createOffer(targetUserId);
        let token: string | null = null;
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
        setOutgoingCall({ userId: targetUserId, username: targetName });
        sendSocketPayload({
          type: "webrtc-offer",
          channelId,
          from: senderName,
          firebaseUserIdToken: token,
          text: null,
          targetUserId,
          sdp: offer,
        });
        pushSystemMessage(`Calling ${targetName}...`);
        clearOutgoingTimer();
        outgoingTimerRef.current = setTimeout(() => {
          sendSocketPayload({
            type: "call-cancelled",
            channelId,
            from: senderName,
            firebaseUserIdToken: null,
            text: null,
            targetUserId,
            reason: "timeout",
          });
          pushSystemMessage(`${targetName} did not answer.`, true);
          setOutgoingCall((current) =>
            current && current.userId === targetUserId ? null : current
          );
          endPeerConnection();
        }, 15000);
      } catch (error) {
        console.error("Call initiation failed", error);
        pushSystemMessage("Unable to start the call.", true);
        endPeerConnection();
      }
    },
    [
      activeCall,
      channelId,
      createOffer,
      endPeerConnection,
      outgoingCall,
      pushSystemMessage,
      sendSocketPayload,
      senderName,
    ]
  );

  const cancelOutgoingCall = useCallback(() => {
    if (!outgoingCall) return;
    sendSocketPayload({
      type: "call-cancelled",
      channelId,
      from: senderName,
      firebaseUserIdToken: null,
      text: null,
      targetUserId: outgoingCall.userId,
      reason: "cancelled",
    });
    pushSystemMessage(`Cancelled call to ${outgoingCall.username}.`);
    clearOutgoingTimer();
    setOutgoingCall(null);
    endPeerConnection();
  }, [
    channelId,
    endPeerConnection,
    outgoingCall,
    pushSystemMessage,
    sendSocketPayload,
    senderName,
  ]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) return;
    clearIncomingTimer();
    endPeerConnection();
    try {
      const answer = await acceptOffer(
        incomingCall.sdp,
        incomingCall.fromUserId
      );
      let token: string | null = null;
      if (auth.currentUser) {
        token = await auth.currentUser.getIdToken();
      }
      sendSocketPayload({
        type: "webrtc-answer",
        channelId,
        from: senderName,
        firebaseUserIdToken: token,
        text: null,
        targetUserId: incomingCall.fromUserId,
        sdp: answer,
      });
      setActiveCall({
        userId: incomingCall.fromUserId,
        username: incomingCall.fromName,
      });
      setIncomingCall(null);
      pushSystemMessage(`Connected with ${incomingCall.fromName}.`);
    } catch (error) {
      console.error("Call answer failed", error);
      pushSystemMessage("Unable to answer call.", true);
      setIncomingCall(null);
      endPeerConnection();
    }
  }, [
    acceptOffer,
    channelId,
    endPeerConnection,
    incomingCall,
    pushSystemMessage,
    sendSocketPayload,
    senderName,
  ]);

  const rejectIncomingCall = useCallback(
    (reason = "rejected") => {
      if (!incomingCall) return;
      sendSocketPayload({
        type: "call-rejected",
        channelId,
        from: senderName,
        firebaseUserIdToken: null,
        text: null,
        targetUserId: incomingCall.fromUserId,
        reason,
      });
      pushSystemMessage(`Declined call from ${incomingCall.fromName}.`);
      clearIncomingTimer();
      setIncomingCall(null);
      endPeerConnection();
    },
    [
      channelId,
      endPeerConnection,
      incomingCall,
      pushSystemMessage,
      sendSocketPayload,
      senderName,
    ]
  );

  const endActiveCall = useCallback(() => {
    if (!activeCall) return;
    sendSocketPayload({
      type: "call-ended",
      channelId,
      from: senderName,
      firebaseUserIdToken: null,
      text: null,
      targetUserId: activeCall.userId,
    });
    pushSystemMessage(`Ended call with ${activeCall.username}.`);
    resetCallState();
  }, [
    activeCall,
    channelId,
    pushSystemMessage,
    resetCallState,
    sendSocketPayload,
    senderName,
  ]);

  useEffect(() => {
    return () => {
      clearIncomingTimer();
      clearOutgoingTimer();
    };
  }, []);

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
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (!input.trim() || !canView) return;
                  sendSocketPayload({
                    type: "chat",
                    channelId,
                    from: senderName,
                    firebaseUserIdToken: null,
                    text: input.trim(),
                  });
                  setInput("");
                }
              }}
            />
            <button
              className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={() => {
                if (!input.trim() || !canView) return;
                sendSocketPayload({
                  type: "chat",
                  channelId,
                  from: senderName,
                  firebaseUserIdToken: null,
                  text: input.trim(),
                });
                setInput("");
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
              roster.map((user) => {
                const isSelf = profile?.uid === user.userId;
                return (
                  <li
                    key={user.userId}
                    className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-900">
                        {user.username}
                      </p>
                      <div className="flex gap-2">
                        {!isSelf && (
                          <button
                            onClick={() => {
                              void initiateCall(user.userId, user.username);
                            }}
                            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                            title={`Start video call with ${user.username}`}
                            aria-label={`Start video call with ${user.username}`}
                          >
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
                              <path d="M15 10.5V8.75a2.25 2.25 0 0 0-2.25-2.25h-6A2.25 2.25 0 0 0 4.5 8.75v6.5A2.25 2.25 0 0 0 6.75 17.5h6A2.25 2.25 0 0 0 15 15.25V13.5l4.5 2.25v-7.5L15 10.5Z" />
                            </svg>
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => {
                              void handleRemoveUser(user.userId, user.username);
                            }}
                            className="rounded-full border border-rose-100 p-2 text-rose-400 transition hover:border-rose-200 hover:text-rose-600"
                            title={`Block ${user.username}`}
                            aria-label={`Block ${user.username}`}
                          >
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
                              <path d="m18 6-12 12M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-2 text-center text-xs text-slate-400">
                No active users
              </li>
            )}
          </ul>
        </aside>
      </section>

      {incomingCall && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Incoming call
            </p>
            <h3 className="mt-2 text-2xl font-bold text-slate-900">
              {incomingCall.fromName}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              Accept the call within 15 seconds or it will auto-decline.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  void acceptIncomingCall();
                }}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Answer
              </button>
              <button
                onClick={() => {
                  rejectIncomingCall("rejected");
                }}
                className="rounded-full border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {outgoingCall && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-4 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm shadow-lg">
          <span>Calling {outgoingCall.username}...</span>
          <button
            onClick={cancelOutgoingCall}
            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300"
          >
            Cancel
          </button>
        </div>
      )}

      {activeCall && (
        <CallPanel
          title={`In call with ${activeCall.username}`}
          localStream={peerState.localStream}
          remoteStream={peerState.remoteStream}
          isSelfMuted={peerState.isSelfMuted}
          isRemoteMuted={peerState.isRemoteMuted}
          onToggleSelfMute={toggleMuteSelf}
          onToggleRemoteMute={toggleMuteRemote}
          onEndCall={endActiveCall}
        />
      )}
    </div>
  );
}
