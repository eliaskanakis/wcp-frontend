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
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });

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

        // Apply codec preferences to ALL video transceivers
        pc.getTransceivers().forEach(t => {
          if (t.receiver.track.kind === "video") {
            try {
              t.setCodecPreferences(baselineCodecs);
              console.log("[RTC] setCodecPreferences applied");
            } catch (err) {
              console.warn("[RTC] codec preference error", err);
            }
          }
        });
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
            track: event.track.kind,
            muted: event.track.muted,
            streams: event.streams?.length ?? 0,
          });
        }

        if (!remoteStreamRef.current) {
          // create stable stream ONCE
          remoteStreamRef.current = new MediaStream();
          setState(prev => ({ ...prev, remoteStream: remoteStreamRef.current }));
        }

        const remoteStream = remoteStreamRef.current;

        // add track if not already present
        if (!remoteStream.getTracks().some(t => t.id === event.track.id)) {
          remoteStream.addTrack(event.track);
        }
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

    stream.getTracks().forEach(track => {
      const senderExists = pc.getSenders().some(
        sender => sender.track?.kind === track.kind
      );
      if (!senderExists) {
        pc.addTrack(track, stream);
      }
    });

    const offer = await pc.createOffer({
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
      console.log("REMOTE OFFER SDP:\n", offer);
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
