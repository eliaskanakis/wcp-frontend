"use client";

import { useEffect, useRef } from "react";

const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

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

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    if (!localStream) {
      video.srcObject = null;
      video.pause();
      return;
    }

    if (video.srcObject !== localStream) {
      video.srcObject = localStream;
    }
    const attemptPlay = () => {
      void video.play().catch(() => {
        /* autoplay suppressed */
      });
    };
    if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      attemptPlay();
    } else {
      video.onloadedmetadata = attemptPlay;
    }
  }, [localStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) return;

    video.muted = isRemoteMuted;

    if (!remoteStream) {
      video.srcObject = null;
      video.pause();
      return;
    }

    video.srcObject = null;
    const cloned = new MediaStream();
    remoteStream.getVideoTracks().forEach((track) => {
      cloned.addTrack(track);
    });
    remoteStream.getAudioTracks().forEach((track) => {
      cloned.addTrack(track);
    });
    video.srcObject = cloned;
    if (DEBUG_CALLS) {
      console.log("[RTC] call-panel remote stream", {
        id: cloned.id,
        tracks: cloned.getTracks().map((track) => ({
          kind: track.kind,
          readyState: track.readyState,
          enabled: track.enabled,
        })),
      });
    }
    const attemptPlay = () => {
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((error: DOMException) => {
          if (
            error.name === "NotAllowedError" ||
            error.name === "NotSupportedError"
          ) {
            console.warn("Retrying remote video play due to:", error.name);
            setTimeout(attemptPlay, 500);
            return;
          }
          console.error("Error playing remote video:", error);
        });
      }
      if (DEBUG_CALLS) {
        console.log("[RTC] call-panel video metrics", {
          readyState: video.readyState,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    const handleLoaded = () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      attemptPlay();
    };
    video.addEventListener("loadedmetadata", handleLoaded);
    attemptPlay();
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
    };
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
              data-remote-video
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
