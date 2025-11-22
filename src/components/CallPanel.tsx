"use client";

import { useEffect, useRef } from "react";

const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

type VideoReadyEvent = "loadedmetadata" | "loadeddata";

const updateVideoSource = (
  video: HTMLVideoElement,
  stream: MediaStream | null
) => {
  if (!stream) {
    video.srcObject = null;
    video.pause();
    return;
  }
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
};

const whenVideoReady = (
  video: HTMLVideoElement,
  events: VideoReadyEvent[],
  callback: () => void
) => {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    callback();
    return;
  }

  const handleLoaded = () => {
    events.forEach((event) => video.removeEventListener(event, handleLoaded));
    callback();
  };

  events.forEach((event) => video.addEventListener(event, handleLoaded));

  return () => {
    events.forEach((event) => video.removeEventListener(event, handleLoaded));
  };
};

type CallPanelProps = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSelfMuted: boolean;
  isRemoteMuted: boolean;
  onToggleSelfMute: () => void;
  onToggleRemoteMute: () => void;
  onEndCall: () => void;
  title: string;
};

export function CallPanel({
  localStream,
  remoteStream,
  isSelfMuted,
  isRemoteMuted,
  onToggleSelfMute,
  onToggleRemoteMute,
  onEndCall,
  title,
}: CallPanelProps) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastRemoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    if (!localStream) {
      updateVideoSource(video, null);
      return;
    }

    updateVideoSource(video, localStream);
    return whenVideoReady(video, ["loadedmetadata"], () => {
      void video.play().catch(() => {});
    });
  }, [localStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    video.muted = isRemoteMuted;

    if (!remoteStream) {
      updateVideoSource(video, null);
      lastRemoteIdRef.current = null;
      return;
    }

    if (lastRemoteIdRef.current !== remoteStream.id) {
      updateVideoSource(video, remoteStream);
      lastRemoteIdRef.current = remoteStream.id;
    }

    const attemptPlay = () => {
      video
        .play()
        .then(() => {
          if (DEBUG_CALLS) console.log("[RTC] remote video playing");
        })
        .catch((err) => {
          if (DEBUG_CALLS) console.warn("[RTC] remote play failed", err);
        });
    };

    return whenVideoReady(video, ["loadedmetadata", "loadeddata"], attemptPlay);
  }, [remoteStream, isRemoteMuted]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onEndCall}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
          >
            End call
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-900 p-2 text-white">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={isRemoteMuted}
              className="h-60 w-full rounded-xl bg-black object-cover"
            />
            <p className="mt-2 text-center text-xs uppercase tracking-wide text-white/80">
              Remote
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="h-60 w-full rounded-xl bg-black object-cover"
            />
            <p className="mt-2 text-center text-xs uppercase tracking-wide text-slate-500">
              You
            </p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm font-semibold">
          <button
            onClick={onToggleSelfMute}
            className={`rounded-full border px-4 py-1.5 transition ${
              isSelfMuted
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-slate-200 text-slate-700 hover:border-slate-300"
            }`}
          >
            {isSelfMuted ? "Unmute me" : "Mute me"}
          </button>
          <button
            onClick={onToggleRemoteMute}
            className={`rounded-full border px-4 py-1.5 transition ${
              isRemoteMuted
                ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                : "border-slate-200 text-slate-700 hover:border-slate-300"
            }`}
          >
            {isRemoteMuted ? "Hear remote" : "Silence remote"}
          </button>
        </div>
      </div>
    </div>
  );
}
