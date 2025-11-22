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
  const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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

        const assignStream = () => {
          const incomingStream = event.streams && event.streams[0];
          const stream =
            remoteStreamRef.current ?? incomingStream ?? new MediaStream();

          if (!stream.getTracks().some((track) => track.id === event.track.id)) {
            stream.addTrack(event.track);
          }

          if (remoteStreamRef.current !== stream) {
            remoteStreamRef.current = stream;
            setState((prev) =>
              prev.remoteStream === stream ? prev : { ...prev, remoteStream: stream }
            );
          }

          onPeerEvent?.("remote-track", event.track.kind);
        };

        if (event.track.muted) {
          event.track.onunmute = () => {
            event.track.onunmute = null;
            assignStream();
          };
          return;
        }

        assignStream();
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

type CodecCapability = {
  mimeType: string;
  clockRate?: number;
  channels?: number;
  sdpFmtpLine?: string;
  preferredPayloadType?: number;
};

type CodecPreference = {
  mimeType: string;
  clockRate: number;
  channels?: number;
  sdpFmtpLine?: string;
};

type RTCRtpCodecCapability = CodecPreference;

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

  const flushRemoteCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pendingRemoteCandidatesRef.current.length) return;
    const candidates = pendingRemoteCandidatesRef.current;
    pendingRemoteCandidatesRef.current = [];
    for (const candidate of candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Failed to add queued remote ICE candidate", error);
      }
    }
  }, []);

  const enforceH264Codecs = useCallback((pc: RTCPeerConnection) => {
    if (typeof RTCRtpSender === "undefined" || !RTCRtpSender.getCapabilities) {
      return;
    }

    const capabilities = RTCRtpSender.getCapabilities("video");
    if (!capabilities) return;

    const allowedProfiles = new Set(["42e01f", "42001f", "4d001f"]);
    const codecs = capabilities.codecs as CodecCapability[];
    const h264Codecs = codecs.filter((codec) => {
      if (codec.mimeType.toLowerCase() !== "video/h264") return false;
      const profile =
        codec.sdpFmtpLine?.toLowerCase().match(/profile-level-id=([0-9a-f]+)/)?.[1] ??
        null;
      return !profile || allowedProfiles.has(profile);
    });

    if (!h264Codecs.length) return;

    const payloadTypes = new Set(
      h264Codecs
        .map((codec) => codec.preferredPayloadType)
        .filter((pt): pt is number => typeof pt === "number")
    );

    const rtxCodecs = codecs.filter(
      (codec) =>
        codec.mimeType.toLowerCase() === "video/rtx" &&
        codec.sdpFmtpLine &&
        Array.from(payloadTypes).some((pt) => codec.sdpFmtpLine!.includes(`apt=${pt}`))
    );

    const preferredCodecs: CodecPreference[] = [...h264Codecs, ...rtxCodecs].map(
      (codec) => ({
        mimeType: codec.mimeType,
        clockRate: codec.clockRate ?? 90000,
        channels: codec.channels,
        sdpFmtpLine: codec.sdpFmtpLine,
      })
    );

    pc.getTransceivers()
      .filter(
        (transceiver) =>
          transceiver.receiver.track?.kind === "video" ||
          transceiver.sender.track?.kind === "video"
      )
      .forEach((transceiver) => {
        try {
          transceiver.setCodecPreferences(preferredCodecs as RTCRtpCodecCapability[]);
        } catch (error) {
          console.warn("[RTC] failed to set codec preferences", error);
        }
      });

    if (DEBUG_CALLS) {
      console.log("[RTC] enforcing H264 codecs", preferredCodecs);
    }
  }, []);

  const syncSendersWithStream = useCallback(
    (pc: RTCPeerConnection, stream: MediaStream) => {
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const existing = senders.find((sender) => sender.track?.kind === track.kind);
        if (existing) {
          void existing.replaceTrack(track);
        } else {
          pc.addTrack(track, stream);
        }
      });
    },
    []
  );

  const createOffer = useCallback(async (targetUserId: string) => {
    const pc = await ensurePeerConnection(targetUserId);

    const stream = await obtainLocalStream();
    syncSendersWithStream(pc, stream);

    enforceH264Codecs(pc);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return offer;
  }, [ensurePeerConnection, obtainLocalStream, enforceH264Codecs, syncSendersWithStream]);

  
  const acceptOffer = useCallback(async (offer: RTCSessionDescriptionInit, targetUserId: string) => {
    const pc = await ensurePeerConnection(targetUserId);

    await pc.setRemoteDescription(offer);
    await flushRemoteCandidates(pc);
    enforceH264Codecs(pc);

    const stream = await obtainLocalStream();
    syncSendersWithStream(pc, stream);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return answer;
  }, [
    ensurePeerConnection,
    obtainLocalStream,
    enforceH264Codecs,
    flushRemoteCandidates,
    syncSendersWithStream,
  ]);


  
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerRef.current) return;
    await peerRef.current.setRemoteDescription(new RTCSessionDescription(answer));
    await flushRemoteCandidates(peerRef.current);
  }, [flushRemoteCandidates]);

  const handleRemoteIce = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      if (!candidate) return;
      const pc = peerRef.current;
      if (!pc || !pc.remoteDescription) {
        pendingRemoteCandidatesRef.current.push(candidate);
        if (DEBUG_CALLS) {
          console.log("[RTC] queued remote ICE", candidate);
        }
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error("Failed to add remote ICE candidate", error);
      }
    },
    []
  );

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

