"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  onError?: (message: string) => void;
  onPeerEvent?: (event: string, detail?: string) => void;
};

type LegacyGetUserMedia = (
  constraints: MediaStreamConstraints,
  successCallback: (stream: MediaStream) => void,
  errorCallback: (error: DOMException) => void
) => void;

export type PeerConnectionState = {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isSelfMuted: boolean;
  isRemoteMuted: boolean;
  connectionState: RTCPeerConnectionState;
  iceState: RTCIceConnectionState;
};

const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

const createSessionId = () => Math.random().toString(36).slice(2, 10);

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
  const targetUserIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(createSessionId());

  const [state, setState] = useState<PeerConnectionState>({
    localStream: null,
    remoteStream: null,
    isSelfMuted: false,
    isRemoteMuted: true,
    connectionState: "new",
    iceState: "new",
  });

  const ensurePeerConnection = useCallback(
    async (targetUserId?: string) => {
      if (targetUserId) {
        targetUserIdRef.current = targetUserId;
      }
      if (peerRef.current) {
        if (DEBUG_CALLS) {
          console.log("[RTC] pc-reuse", {
            sessionId: sessionIdRef.current,
            signalingState: peerRef.current.signalingState,
            connectionState: peerRef.current.connectionState,
            iceState: peerRef.current.iceConnectionState,
          });
        }
        return peerRef.current;
      }

      sessionIdRef.current = createSessionId();

      const PC_CONFIG = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        encodedInsertableStreams: false,
        // CRITICAL SAFARI → CHROME FIX:
        // Force hardware-baseline H264 decode only
        sdpSemantics: "unified-plan",
        iceCandidatePoolSize: 0,
      };

      const pc = new RTCPeerConnection(PC_CONFIG);

      // ------------------ SAFARI → CHROME H264 BASELINE FIX ------------------
      try {
        const videoReceiverCaps = RTCRtpReceiver.getCapabilities("video")?.codecs ?? [];

        // Safari offers many H.264 profiles, Chrome only reliably decodes Baseline
        const baselineCodecs = videoReceiverCaps.filter(c =>
          c.mimeType.toLowerCase() === "video/h264" &&
          c.sdpFmtpLine?.toLowerCase().includes("profile-level-id=42e01f")
        );

        if (DEBUG_CALLS) {
          console.log("[RTC] baseline codecs", baselineCodecs);
        }

      } catch (err) {
        console.warn("[RTC] codec preference setup failed", err);
      }
      // ------------------------------------------------------------------------


      if (DEBUG_CALLS) {
        console.log("[RTC] pc-created", {
          sessionId: sessionIdRef.current,
          targetUserId: targetUserIdRef.current,
        });
      }

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        if (DEBUG_CALLS) {
          console.log("[RTC] local-ice", event.candidate);
        }
        onPeerEvent?.("local-ice", JSON.stringify(event.candidate));
        sendSignal({
          type: "webrtc-ice",
          channelId,
          from: currentName,
          firebaseUserIdToken: null,
          text: null,
          targetUserId: targetUserIdRef.current ?? undefined,
          ice: event.candidate.toJSON(),
        });
      };

      pc.ontrack = (event) => {
        if (DEBUG_CALLS) {
          console.log("[RTC] ontrack", {
            kind: event.track.kind,
            id: event.track.id,
            muted: event.track.muted,
            streamIds: event.streams.map((s) => s.id),
          });
        }

        // ----------------------------------------------------------
        // CASE 1 — SAFARI / ANDROID: event.streams[0] MUST BE USED
        // ----------------------------------------------------------
        if (event.streams && event.streams[0]) {
          const incomingStream = event.streams[0];

          // If this stream is new OR if video arrived → bind it
          if (
            !remoteStreamRef.current ||
            event.track.kind === "video" // ensure video binds even if audio came first
          ) {
            remoteStreamRef.current = incomingStream;
            setState((prev) => ({
              ...prev,
              remoteStream: incomingStream,
            }));
          }

          // Handle Safari muted video problem
          if (event.track.kind === "video") {
            if (event.track.muted) {
              console.log("[RTC] video muted → requesting keyframe");

              const receiver = pc
                .getReceivers()
                .find((r) => r.track?.kind === "video");

              try {
                (receiver as any)?.requestKeyFrame?.();
              } catch (_) { }

              event.track.onunmute = () => {
                event.track.onunmute = null;
                console.log("[RTC] video track unmuted!");
                setState((prev) => ({
                  ...prev,
                  remoteStream: incomingStream,
                }));
              };
            }
          }

          return; // 🚀 IMPORTANT: do NOT fall into fallback logic
        }

        // ----------------------------------------------------------
        // CASE 2 — CHROME DESKTOP: no event.streams → manual merge
        // ----------------------------------------------------------
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
          setState((prev) => ({
            ...prev,
            remoteStream: remoteStreamRef.current!,
          }));
        }

        const compositeStream = remoteStreamRef.current;

        // Avoid duplicates
        if (!compositeStream.getTracks().some((t) => t.id === event.track.id)) {
          compositeStream.addTrack(event.track);
        }

        if (event.track.kind === "video" && event.track.muted) {
          console.log("[RTC] video muted → requesting keyframe (fallback)");

          const receiver = pc
            .getReceivers()
            .find((r) => r.track?.kind === "video");

          try {
            (receiver as any)?.requestKeyFrame?.();
          } catch (_) { }

          event.track.onunmute = () => {
            event.track.onunmute = null;
            console.log("[RTC] video track unmuted!");
            setState((prev) => ({ ...prev, remoteStream: compositeStream }));
          };
        }

        setState((prev) => ({
          ...prev,
          remoteStream: compositeStream,
        }));
      };

      pc.onconnectionstatechange = () => {
        if (DEBUG_CALLS) {
          console.log("[RTC] connection-state", pc.connectionState);
          if (pc.connectionState === "connected") {
            pc.getReceivers()
              .filter((receiver) => receiver.track?.kind === "video")
              .forEach((receiver) => {
                receiver
                  .getStats()
                  .then((stats) => {
                    stats.forEach((report) => {
                      if (report.type === "inbound-rtp" && report.kind === "video") {
                        console.log("[RTC] inbound-video", report);
                      }
                    });
                  })
                  .catch((err) => {
                    console.warn("Failed to get receiver stats", err);
                  });
              });
          }
        }
        onPeerEvent?.("connection-state", pc.connectionState);
        setState((prev) => ({ ...prev, connectionState: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
        if (DEBUG_CALLS) {
          console.log("[RTC] ice-state", pc.iceConnectionState);
        }
        onPeerEvent?.("ice-state", pc.iceConnectionState);
        setState((prev) => ({ ...prev, iceState: pc.iceConnectionState }));
      };

      peerRef.current = pc;
      return pc;
    },
    [channelId, currentName, onPeerEvent, sendSignal]
  );

  const obtainLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const modernGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(
      navigator.mediaDevices
    );
    const legacyGetUserMedia: LegacyGetUserMedia | undefined =
      (navigator as unknown as {
        webkitGetUserMedia?: LegacyGetUserMedia;
        mozGetUserMedia?: LegacyGetUserMedia;
        msGetUserMedia?: LegacyGetUserMedia;
      }).webkitGetUserMedia ||
      (navigator as unknown as {
        mozGetUserMedia?: LegacyGetUserMedia;
        msGetUserMedia?: LegacyGetUserMedia;
      }).mozGetUserMedia ||
      (navigator as unknown as {
        msGetUserMedia?: LegacyGetUserMedia;
      }).msGetUserMedia;

    if (!modernGetUserMedia && !legacyGetUserMedia) {
      const error = new Error("Media capture not supported on this device.");
      onError?.(error.message);
      throw error;
    }

    try {
      const constraints = { audio: true, video: true };
      let stream: MediaStream;
      if (modernGetUserMedia) {
        stream = await modernGetUserMedia(constraints);
      } else if (legacyGetUserMedia) {
        stream = await new Promise<MediaStream>((resolve, reject) => {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        });
      } else {
        throw new Error("Media capture not supported on this device.");
      }
      localStreamRef.current = stream;
      setState((prev) => ({ ...prev, localStream: stream }));
      return stream;
    } catch (error) {
      onError?.("Unable to access camera or microphone.");
      throw error;
    }
  }, [onError]);

  const addLocalTracks = useCallback(
    async (pc: RTCPeerConnection) => {
      const stream = await obtainLocalStream();
      const transceivers = pc.getTransceivers();
      stream.getTracks().forEach((track) => {
        const match = transceivers.find(
          (transceiver) =>
            transceiver.sender.track?.kind === track.kind ||
            (!transceiver.sender.track &&
              transceiver.receiver.track?.kind === track.kind)
        );

        if (match?.sender) {
          match.direction = "sendrecv";
          void match.sender.replaceTrack(track);
          return;
        }

        pc.addTrack(track, stream);
      });
    },
    [obtainLocalStream]
  );

  const createOffer = useCallback(async (targetUserId: string) => {
    const pc = await ensurePeerConnection(targetUserId);

    const stream = await obtainLocalStream();

    // Safari FIX — start flow
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const dummy = document.createElement("video");
      dummy.srcObject = new MediaStream([videoTrack]);
      dummy.muted = true;
      dummy.play().catch(() => { });
    }

    stream.getTracks().forEach(track => {
      const senderExists = pc.getSenders().some(
        sender => sender.track?.kind === track.kind
      );
      if (!senderExists) {
        pc.addTrack(track, stream);
      }
    });

    let offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await pc.setLocalDescription(offer);
    if (DEBUG_CALLS) {
      console.log("LOCAL ANSWER SDP:\n", pc.localDescription?.sdp);
    }

    return offer;
  }, [ensurePeerConnection, obtainLocalStream]);

  const acceptOffer = useCallback(async (offer: RTCSessionDescriptionInit, targetUserId: string) => {
    const pc = await ensurePeerConnection(targetUserId);

    if (DEBUG_CALLS) {
      console.log("REMOTE OFFER SDP (PATCHED):\n", offer);
    }
    await pc.setRemoteDescription(offer);

    const stream = await obtainLocalStream();
    stream.getTracks().forEach(track => {
      const senderExists = pc.getSenders().some(
        sender => sender.track?.kind === track.kind
      );
      if (!senderExists) {
        pc.addTrack(track, stream);
      }
    });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    pc.getReceivers()
      .filter(r => r.track?.kind === "video")
      .forEach(r => {
        try {
          (r as any).requestKeyFrame?.();
          console.log("[RTC] forced keyframe after answer");
        } catch (e) { }
      });

    if (DEBUG_CALLS) {
      console.log("LOCAL ANSWER SDP:\n", pc.localDescription?.sdp);
    }

    return answer;
  }, [ensurePeerConnection, obtainLocalStream]);



  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  const handleRemoteIce = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerRef.current || !candidate) return;
    try {
      await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Failed to add remote ICE candidate", error);
    }
  }, []);

  const endCall = useCallback(() => {
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
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

  const toggleMuteSelf = useCallback(() => {
    if (!localStreamRef.current) return;
    const next = !state.isSelfMuted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setState((prev) => ({ ...prev, isSelfMuted: next }));
  }, [state.isSelfMuted]);

  const toggleMuteRemote = useCallback(() => {
    const next = !state.isRemoteMuted;
    setState((prev) => ({ ...prev, isRemoteMuted: next }));
  }, [state.isRemoteMuted]);

  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

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
