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

type MediaTransceiverMap = Partial<Record<"audio" | "video", RTCRtpTransceiver>>;

const createSessionId = () => Math.random().toString(36).slice(2, 10);
const DEBUG_CALLS =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === "true";

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
  const transceiversRef = useRef<MediaTransceiverMap>({});
  const sessionIdRef = useRef<string>(createSessionId());

  const [state, setState] = useState<PeerConnectionState>({
    localStream: null,
    remoteStream: null,
    isSelfMuted: false,
    isRemoteMuted: true,
    connectionState: "new",
    iceState: "new",
  });

  const emitDebug = useCallback(
    (event: string, detail?: unknown) => {
      if (!DEBUG_CALLS || !onPeerEvent) return;
      if (detail === undefined) {
        onPeerEvent(event);
        return;
      }
      try {
        const payload =
          typeof detail === "string" ? detail : JSON.stringify(detail);
        onPeerEvent(event, payload);
      } catch {
        onPeerEvent(event, String(detail));
      }
    },
    [onPeerEvent]
  );

  const ensurePeerConnection = useCallback(
    async (targetUserId?: string) => {
      if (targetUserId) {
        targetUserIdRef.current = targetUserId;
      }
      if (peerRef.current) {
        if (
          peerRef.current.connectionState === "closed" ||
          peerRef.current.signalingState === "closed"
        ) {
          emitDebug("pc-closed-recycle", {
            sessionId: sessionIdRef.current,
          });
          peerRef.current = null;
        } else {
          emitDebug("pc-reuse", {
            sessionId: sessionIdRef.current,
            targetUserId: targetUserIdRef.current,
            signalingState: peerRef.current.signalingState,
            connectionState: peerRef.current.connectionState,
          });
          return peerRef.current;
        }
      }

      sessionIdRef.current = createSessionId();
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      emitDebug("pc-created", {
        sessionId: sessionIdRef.current,
        targetUserId: targetUserIdRef.current,
      });

      const configured: MediaTransceiverMap = {};
      (["audio", "video"] as const).forEach((kind) => {
        if (typeof pc.addTransceiver !== "function") {
          return;
        }
        try {
          configured[kind] = pc.addTransceiver(kind, { direction: "sendrecv" });
        } catch {
          /* Ignore browsers that cannot preconfigure this transceiver */
        }
      });
      transceiversRef.current = configured;
      emitDebug("pc-transceivers", {
        sessionId: sessionIdRef.current,
        audio: Boolean(configured.audio),
        video: Boolean(configured.video),
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
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
        emitDebug("ontrack", {
          sessionId: sessionIdRef.current,
          track: event.track.kind,
          muted: event.track.muted,
          streams: event.streams?.length ?? 0,
        });
        const assignStream = (stream: MediaStream) => {
          remoteStreamRef.current = stream;
          setState((prev) => ({ ...prev, remoteStream: stream }));
          if (DEBUG_CALLS) {
            console.log("[RTC] remote-stream:update", {
              sessionId: sessionIdRef.current,
              tracks: stream?.getTracks().map((track) => ({
                kind: track.kind,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState,
              })),
            });
          }
          onPeerEvent?.("remote-track", event.track.kind);
        };

        const ensureStream = () => {
          if (event.streams && event.streams[0]) {
            assignStream(event.streams[0]);
            return;
          }
          const inboundStream = new MediaStream();
          inboundStream.addTrack(event.track);
          assignStream(inboundStream);
        };

        if (event.track.muted) {
          event.track.onunmute = () => {
            event.track.onunmute = null;
            ensureStream();
          };
        } else {
          ensureStream();
        }
      };

      pc.onconnectionstatechange = () => {
        onPeerEvent?.("connection-state", pc.connectionState);
        setState((prev) => ({ ...prev, connectionState: pc.connectionState }));
        emitDebug("pc-conn-change", {
          sessionId: sessionIdRef.current,
          connectionState: pc.connectionState,
          signalingState: pc.signalingState,
          iceState: pc.iceConnectionState,
        });
      };

      pc.oniceconnectionstatechange = () => {
        onPeerEvent?.("ice-state", pc.iceConnectionState);
        setState((prev) => ({ ...prev, iceState: pc.iceConnectionState }));
        emitDebug("pc-ice-change", {
          sessionId: sessionIdRef.current,
          iceState: pc.iceConnectionState,
        });
      };

      peerRef.current = pc;
      return pc;
    },
    [channelId, currentName, emitDebug, sendSignal]
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
      const transceivers = transceiversRef.current;
      const hasConfiguredTransceivers = Boolean(
        transceivers.audio || transceivers.video
      );
      emitDebug("add-tracks:start", {
        sessionId: sessionIdRef.current,
        trackKinds: stream.getTracks().map((track) => track.kind),
        signalingState: pc.signalingState,
      });

      if (hasConfiguredTransceivers) {
        const replacements: Promise<void>[] = [];
        const fallbackTracks: MediaStreamTrack[] = [];

        stream.getTracks().forEach((track) => {
          const kind =
            track.kind === "audio"
              ? "audio"
              : track.kind === "video"
                ? "video"
                : null;
          if (kind) {
            const transceiver = transceivers[kind];
            if (transceiver?.sender) {
              transceiver.direction = "sendrecv";
              replacements.push(transceiver.sender.replaceTrack(track));
              return;
            }
          }
          fallbackTracks.push(track);
        });

        if (replacements.length > 0) {
          await Promise.all(replacements);
        }

        if (fallbackTracks.length > 0) {
          const senders = pc.getSenders();
          fallbackTracks.forEach((track) => {
            const hasSender = senders.some(
              (sender) => sender.track && sender.track.kind === track.kind
            );
            if (!hasSender) {
              pc.addTrack(track, stream);
            }
          });
        }
        emitDebug("add-tracks:done", {
          sessionId: sessionIdRef.current,
          via: "transceiver",
        });
        return;
      }

      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const alreadySending = senders.some(
          (sender) => sender.track && sender.track.kind === track.kind
        );
        if (!alreadySending) {
          pc.addTrack(track, stream);
        }
      });
      emitDebug("add-tracks:done", {
        sessionId: sessionIdRef.current,
        via: "addTrack",
      });
    },
    [emitDebug, obtainLocalStream]
  );

  const createOffer = useCallback(
    async (targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);
      emitDebug("create-offer:start", {
        sessionId: sessionIdRef.current,
        signalingState: pc.signalingState,
      });
      await addLocalTracks(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      emitDebug("create-offer:success", {
        sessionId: sessionIdRef.current,
        sdpType: offer.type,
        sdpLines: offer.sdp ? offer.sdp.split("\n").length : 0,
        signalingState: pc.signalingState,
      });
      return offer;
    },
    [addLocalTracks, emitDebug, ensurePeerConnection]
  );

  const acceptOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);
      emitDebug("accept-offer:start", {
        sessionId: sessionIdRef.current,
        offerType: offer.type,
        sdpLines: offer.sdp ? offer.sdp.split("\n").length : 0,
        signalingState: pc.signalingState,
      });
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await addLocalTracks(pc);
      pc.getTransceivers().forEach((transceiver) => {
        if (transceiver.receiver.track.kind === "video") {
          transceiver.direction = "sendrecv";
        }
      });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emitDebug("accept-offer:answer", {
        sessionId: sessionIdRef.current,
        signalingState: pc.signalingState,
        answerType: answer.type,
        sdpLines: answer.sdp ? answer.sdp.split("\n").length : 0,
      });
      return answer;
    },
    [addLocalTracks, emitDebug, ensurePeerConnection]
  );

  const handleAnswer = useCallback(
    async (answer: RTCSessionDescriptionInit) => {
      if (!peerRef.current) return;
      emitDebug("handle-answer", {
        sessionId: sessionIdRef.current,
        signalingState: peerRef.current.signalingState,
        answerType: answer.type,
        sdpLines: answer.sdp ? answer.sdp.split("\n").length : 0,
      });
      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    },
    [emitDebug]
  );

  const handleRemoteIce = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      if (!peerRef.current || !candidate) return;
      try {
        emitDebug("remote-ice", {
          sessionId: sessionIdRef.current,
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
          signalingState: peerRef.current.signalingState,
        });
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Failed to add remote ICE candidate", error);
      }
    },
    [emitDebug]
  );

  const endCall = useCallback(() => {
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    targetUserIdRef.current = null;
    transceiversRef.current = {};
    sessionIdRef.current = createSessionId();
    emitDebug("pc-reset", { sessionId: sessionIdRef.current });
    setState({
      localStream: null,
      remoteStream: null,
      isSelfMuted: false,
      isRemoteMuted: true,
      connectionState: "new",
      iceState: "new",
    });
  }, [emitDebug]);

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
