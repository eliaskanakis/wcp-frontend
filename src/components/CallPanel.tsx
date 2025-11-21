"use client";

import { useEffect, useRef } from "react";

const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

type CallPanelProps = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSelfMuted: boolean;
  isRemoteMuted: boolean;   // audio mute ONLY (not video element mute)
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

  /* ----------------------------------------------------------
     LOCAL VIDEO BINDING
  ---------------------------------------------------------- */
  useEffect(() => {
    const vid = localVideoRef.current;
    if (!vid) return;

    if (!localStream) {
      vid.srcObject = null;
      vid.pause();
      return;
    }

    if (vid.srcObject !== localStream) {
      vid.srcObject = localStream;
    }

    const tryPlay = () => {
      vid.play().catch(() => {});
    };

    if (vid.readyState >= HTMLMediaElement.HAVE_METADATA) {
      tryPlay();
    } else {
      vid.onloadedmetadata = tryPlay;
    }
  }, [localStream]);

  /* ----------------------------------------------------------
     REMOTE VIDEO BINDING (very important)
  ---------------------------------------------------------- */
  useEffect(() => {
    const vid = remoteVideoRef.current;
    if (!vid) return;

    if (!remoteStream) {
      vid.srcObject = null;
      vid.pause();
      return;
    }

    // Bind only if the stream instance changed
    if (vid.srcObject !== remoteStream) {
      if (DEBUG_CALLS) console.log("🟦 Binding remote stream");
      vid.srcObject = remoteStream;

      // Immediate attempt
      vid.play().catch(() => {});
    }

    // Safari sometimes fires only loadeddata
    const tryPlay = () => {
      vid
        .play()
        .then(() => {
          if (DEBUG_CALLS) console.log("🟩 remote video playing");
        })
        .catch((err) => {
          if (DEBUG_CALLS) console.warn("🟥 remote video play() failed", err);
        });
    };

    vid.onloadedmetadata = tryPlay;
    vid.onloadeddata = tryPlay;

    return () => {
      vid.onloadedmetadata = null;
      vid.onloadeddata = null;
    };
  }, [remoteStream]);

  /* ----------------------------------------------------------
     REMOTE AUDIO MUTE (controls audio track)
  ---------------------------------------------------------- */
  useEffect(() => {
    if (!remoteStream) return;
    remoteStream.getAudioTracks().forEach((t) => {
      t.enabled = !isRemoteMuted;
    });
  }, [remoteStream, isRemoteMuted]);

  /* ----------------------------------------------------------
     UI RENDER
  ---------------------------------------------------------- */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onEndCall}
            className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
          >
            End call
          </button>
        </div>

        {/* VIDEO GRID */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* REMOTE */}
          <div className="rounded-2xl bg-slate-900 p-2 text-white">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted   // must be muted for autoplay, audio track is controlled separately
              className="h-60 w-full rounded-xl bg-black object-cover"
            />
            <p className="mt-2 text-center text-xs uppercase tracking-wide text-white/80">
              Remote
            </p>
          </div>

          {/* LOCAL */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted     // always muted (local echo prevention)
              className="h-60 w-full rounded-xl bg-black object-cover"
            />
            <p className="mt-2 text-center text-xs uppercase tracking-wide text-slate-500">
              You
            </p>
          </div>
        </div>

        {/* CONTROLS */}
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
