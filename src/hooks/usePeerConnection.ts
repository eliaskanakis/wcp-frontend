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
};

export function usePeerConnection({
  channelId,
  currentName,
  sendSignal,
  onError,
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
        if (!targetUserIdRef.current){
          console.warn("No target user ID for ICE candidate, skipping sendSignal");
        }else{
           console.log("Sending ICE candidate to", targetUserIdRef.current);
        }
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
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
        } else {
          const existing =
            remoteStreamRef.current ?? new MediaStream();
          existing.addTrack(event.track);
          remoteStreamRef.current = existing;
        }
        setState((prev) => ({
          ...prev,
          remoteStream: remoteStreamRef.current,
        }));
      };

      peerRef.current = pc;
      return pc;
    },
    [channelId, currentName, sendSignal]
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
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
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
      await addLocalTracks(pc);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
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
      isRemoteMuted: false,
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
