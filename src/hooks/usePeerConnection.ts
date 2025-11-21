"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* ---------------------------------------------------------
   DEVICE DETECTION
--------------------------------------------------------- */
function isChromeDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;

  return (
    /Chrome/.test(ua) &&
    !/Edg/.test(ua) &&
    !/OPR/.test(ua) &&
    !/CriOS/.test(ua) &&
    !/Android/.test(ua)
  );
}

const IS_CHROME_DESKTOP = isChromeDesktop();

const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

/* ---------------------------------------------------------
   VP8-ONLY SANITIZER (INCOMING OFFERS)
   - removes all video codecs except VP8 and its RTX
--------------------------------------------------------- */
function sanitizeIncomingOfferForVp8Only(
  offer: RTCSessionDescriptionInit
): RTCSessionDescriptionInit {
  if (!offer.sdp) return offer;

  const lines = offer.sdp.split(/\r?\n/);

  const out: string[] = [];
  let inVideo = false;

  const vp8Pts: number[] = [];
  const rtxPts: number[] = [];
  let currentPt: string | null = null;

  /* PASS 1 — identify VP8 PT and RTX PT */
  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("m=video")) {
      inVideo = true;
      continue;
    }

    if (inVideo && line.startsWith("a=rtpmap:")) {
      const m = line.match(/^a=rtpmap:(\d+)\s+(.+)$/);
      if (!m) continue;
      const pt = Number(m[1]);
      const codec = m[2];

      if (/VP8\/90000/i.test(codec)) {
        vp8Pts.push(pt);
      }
    }

    if (inVideo && line.startsWith("a=fmtp:")) {
      const m = line.match(/^a=fmtp:(\d+)\s+(.+)$/);
      if (!m) continue;
      const pt = Number(m[1]);
      const fmtp = m[2];
      if (fmtp.includes("apt=")) {
        const apt = Number(fmtp.split("apt=")[1]);
        if (vp8Pts.includes(apt)) {
          rtxPts.push(pt);
        }
      }
    }

    if (line.startsWith("m=audio")) {
      inVideo = false;
    }
  }

  const keepPts = [...vp8Pts, ...rtxPts];

  /* PASS 2 — rebuild SDP */
  inVideo = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith("m=video")) {
      inVideo = true;

      if (keepPts.length === 0) {
        console.warn("[RTC] No VP8 payload found in remote SDP. Keeping original.");
        out.push(raw);
        continue;
      }

      out.push(`m=video 9 UDP/TLS/RTP/SAVPF ${keepPts.join(" ")}`);
      continue;
    }

    if (inVideo) {
      if (line.startsWith("a=rtpmap:")) {
        const pt = Number(line.match(/^a=rtpmap:(\d+)/)?.[1] ?? -1);
        if (keepPts.includes(pt)) {
          out.push(line);
        }
        continue;
      }

      if (line.startsWith("a=fmtp:")) {
        const pt = Number(line.match(/^a=fmtp:(\d+)/)?.[1] ?? -1);
        if (keepPts.includes(pt)) {
          out.push(line);
        }
        continue;
      }

      if (line.startsWith("a=rtcp-fb:")) {
        const pt = Number(line.match(/^a=rtcp-fb:(\d+)/)?.[1] ?? -1);
        if (keepPts.includes(pt)) {
          out.push(line);
        }
        continue;
      }

      if (
        line.startsWith("a=ssrc") ||
        line.startsWith("a=ssrc-group") ||
        line.startsWith("a=mid:") ||
        line.startsWith("a=msid:") ||
        line.startsWith("a=send") ||
        line.startsWith("a=recv") ||
        line.startsWith("a=inactive") ||
        line.startsWith("a=fingerprint") ||
        line.startsWith("a=setup") ||
        line.startsWith("a=ice-") ||
        line.startsWith("a=extmap") ||
        line.startsWith("a=rtcp-mux") ||
        line.startsWith("a=rtcp-rsize") ||
        line.startsWith("c=IN")
      ) {
        out.push(line);
        continue;
      }

      continue;
    }

    out.push(line);
  }

  return {
    type: offer.type,
    sdp: out.join("\r\n") + "\r\n",
  };
}

/* ---------------------------------------------------------
   TYPES
--------------------------------------------------------- */
type SendSignal = (payload: {
  type: string;
  channelId: string;
  from: string;
  firebaseUserIdToken: string | null;
  text?: string | null;
  targetUserId?: string;
  sdp?: RTCSessionDescriptionInit;
  ice?: RTCIceCandidateInit;
}) => void;

type Options = {
  channelId: string;
  currentName: string;
  sendSignal: SendSignal;
  onError?: (msg: string) => void;
  onPeerEvent?: (event: string, detail?: string) => void;
};

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  success: (stream: MediaStream) => void,
  error: (err: DOMException) => void
) => void;

export type PeerConnectionState = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSelfMuted: boolean;
  isRemoteMuted: boolean;
  connectionState: RTCPeerConnectionState;
  iceState: RTCIceConnectionState;
};

/* ---------------------------------------------------------
   MAIN HOOK
--------------------------------------------------------- */
export function usePeerConnection({
  channelId,
  currentName,
  sendSignal,
  onError,
  onPeerEvent,
}: Options) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>(() =>
    Math.random().toString(36).slice(2, 10)
  );
  const targetUserIdRef = useRef<string | null>(null);

  const [state, setState] = useState<PeerConnectionState>({
    localStream: null,
    remoteStream: null,
    isSelfMuted: false,
    isRemoteMuted: true,
    connectionState: "new",
    iceState: "new",
  });

  /* ---------------------------------------------------------
     Ensure PeerConnection
  --------------------------------------------------------- */
  const ensurePeerConnection = useCallback(
    async (targetUserId?: string) => {
      if (targetUserId) targetUserIdRef.current = targetUserId;

      if (peerRef.current) {
        return peerRef.current;
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        sdpSemantics: "unified-plan",
      });

      peerRef.current = pc;

      /* ICE */
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        sendSignal({
          type: "webrtc-ice",
          channelId,
          from: currentName,
          firebaseUserIdToken: null,
          targetUserId: targetUserIdRef.current ?? undefined,
          ice: ev.candidate.toJSON(),
        });
      };

      /* TRACKS */
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          remoteStreamRef.current = stream;
          setState((prev) => ({ ...prev, remoteStream: stream }));

          if (event.track.kind === "video" && event.track.muted) {
            const receiver = pc
              .getReceivers()
              .find((r) => r.track?.kind === "video");
            try {
              (receiver as any)?.requestKeyFrame?.();
            } catch {}
            event.track.onunmute = () => {
              event.track.onunmute = null;
              remoteStreamRef.current = stream;
              setState((prev) => ({ ...prev, remoteStream: stream }));
            };
          }

          return;
        }

        /* Chrome desktop fallback */
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
          setState((prev) => ({
            ...prev,
            remoteStream: remoteStreamRef.current!,
          }));
        }

        const composite = remoteStreamRef.current;
        if (!composite.getTracks().some((t) => t.id === event.track.id)) {
          composite.addTrack(event.track);
        }

        remoteStreamRef.current = composite;
        setState((prev) => ({ ...prev, remoteStream: composite }));
      };

      pc.onconnectionstatechange = () => {
        setState((s) => ({ ...s, connectionState: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
        setState((s) => ({ ...s, iceState: pc.iceConnectionState }));
      };

      return pc;
    },
    [channelId, currentName, sendSignal]
  );

  /* ---------------------------------------------------------
     Local Stream
  --------------------------------------------------------- */
  const obtainLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const modern = navigator.mediaDevices?.getUserMedia?.bind(
      navigator.mediaDevices
    );
    const legacy: LegacyGetUserMedia | undefined =
      (navigator as any).webkitGetUserMedia ||
      (navigator as any).mozGetUserMedia ||
      (navigator as any).msGetUserMedia;

    if (!modern && !legacy) {
      const err = "Media devices not supported";
      onError?.(err);
      throw new Error(err);
    }

    let stream: MediaStream;

    if (modern) {
      stream = await modern({ audio: true, video: true });
    } else {
      stream = await new Promise((resolve, reject) => {
        legacy!(
          { audio: true, video: true },
          (s) => resolve(s),
          (e) => reject(e)
        );
      });
    }

    localStreamRef.current = stream;
    setState((prev) => ({ ...prev, localStream: stream }));

    return stream;
  }, [onError]);

  /* ---------------------------------------------------------
     Offer Creation
  --------------------------------------------------------- */
  const createOffer = useCallback(
    async (targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);
      const stream = await obtainLocalStream();

      stream.getTracks().forEach((t) => {
        const exists = pc.getSenders().some((s) => s.track === t);
        if (!exists) pc.addTrack(t, stream);
      });

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await pc.setLocalDescription(offer);
      return offer;
    },
    [ensurePeerConnection, obtainLocalStream]
  );

  /* ---------------------------------------------------------
     Accept Remote Offer (VP8-only sanitization)
  --------------------------------------------------------- */
  const acceptOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);

      const sanitized = sanitizeIncomingOfferForVp8Only(offer);

      await pc.setRemoteDescription(sanitized);

      const stream = await obtainLocalStream();
      stream.getTracks().forEach((t) => {
        const exists = pc.getSenders().some((s) => s.track === t);
        if (!exists) pc.addTrack(t, stream);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      return answer;
    },
    [ensurePeerConnection, obtainLocalStream]
  );

  /* ---------------------------------------------------------
     Accept Answer
  --------------------------------------------------------- */
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(answer);
  }, []);

  /* ---------------------------------------------------------
     Remote ICE
  --------------------------------------------------------- */
  const handleRemoteIce = useCallback(async (cand: RTCIceCandidateInit) => {
    if (!peerRef.current) return;
    try {
      await peerRef.current.addIceCandidate(cand);
    } catch (err) {
      console.warn("Failed to add ICE", err);
    }
  }, []);

  /* ---------------------------------------------------------
     End Call
  --------------------------------------------------------- */
  const endCall = useCallback(() => {
    peerRef.current?.getSenders().forEach((s) => s.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    remoteStreamRef.current = null;
    targetUserIdRef.current = null;

    setState({
      localStream: null,
      remoteStream: null,
      isSelfMuted: false,
      isRemoteMuted: true,
      connectionState: "new",
      iceState: "new",
    });
  }, []);

  /* ---------------------------------------------------------
     Mute Toggles
  --------------------------------------------------------- */
  const toggleMuteSelf = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !state.isSelfMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setState((p) => ({ ...p, isSelfMuted: next }));
  }, [state.isSelfMuted]);

  const toggleMuteRemote = useCallback(() => {
    const next = !state.isRemoteMuted;
    setState((p) => ({ ...p, isRemoteMuted: next }));
  }, [state.isRemoteMuted]);

  /* ---------------------------------------------------------
     Cleanup
  --------------------------------------------------------- */
  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  /* ---------------------------------------------------------
     RETURN
  --------------------------------------------------------- */
  return {
    createOffer,
    acceptOffer,
    handleAnswer,
    handleRemoteIce,
    endCall,
    state,
    toggleMuteSelf,
    toggleMuteRemote,
  };
}
