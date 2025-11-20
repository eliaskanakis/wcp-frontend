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
      if (peerRef.current) return peerRef.current;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
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
        const assignStream = (stream: MediaStream) => {
          remoteStreamRef.current = stream;
          setState((prev) => ({ ...prev, remoteStream: stream }));
          onPeerEvent?.("remote-track", event.track.kind);
        };

        if (event.streams && event.streams[0]) {
          const [stream] = event.streams;
          if (event.track.muted) {
            event.track.onunmute = () => {
              event.track.onunmute = null;
              assignStream(stream);
            };
          } else {
            assignStream(stream);
          }
        } else {
          const inboundStream =
            remoteStreamRef.current ?? new MediaStream();
          inboundStream.addTrack(event.track);
          remoteStreamRef.current = inboundStream;
          if (event.track.muted) {
            event.track.onunmute = () => {
              event.track.onunmute = null;
              assignStream(inboundStream);
            };
          } else {
            assignStream(inboundStream);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        onPeerEvent?.("connection-state", pc.connectionState);
        setState((prev) => ({ ...prev, connectionState: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
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
      const senders = pc.getSenders();
      stream.getTracks().forEach((track) => {
        const alreadySending = senders.some(
          (sender) => sender.track && sender.track.kind === track.kind
        );
        if (!alreadySending) {
          pc.addTrack(track, stream);
        }
      });
    },
    [obtainLocalStream]
  );

  const createOffer = useCallback(
    async (targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);
      await addLocalTracks(pc);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      return offer;
    },
    [addLocalTracks, ensurePeerConnection]
  );

  const acceptOffer = useCallback(
    async (offer: RTCSessionDescriptionInit, targetUserId: string) => {
      const pc = await ensurePeerConnection(targetUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await addLocalTracks(pc);
      pc.getTransceivers().forEach((transceiver) => {
        if (transceiver.receiver.track.kind === "video") {
          transceiver.direction = "sendrecv";
        }
      });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    },
    [addLocalTracks, ensurePeerConnection]
  );

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
