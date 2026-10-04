"use client";

import type { CallMode, CallPhase } from "./types";

type SignalSender = (msg: Record<string, unknown>) => void;

interface CallHandlers {
  onPhase?: (phase: CallPhase, endReason?: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onIncoming?: (peerUsername: string, mode: CallMode, callId: string) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: ["turn:5.35.83.69:3478?transport=udp", "turn:5.35.83.69:3478?transport=tcp"],
      username: "webrtc",
      credential: "jwchatturn1790185471",
    },
  ],
};

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let sender: SignalSender | null = null;
let handlers: CallHandlers = {};
let myStream: MediaStream | null = null;
let myUsername = "";
let targetUsername = "";
let activeCallId = "";
let connectTimer: ReturnType<typeof setTimeout> | null = null;
const pendingCandidates: RTCIceCandidateInit[] = [];

function emit(msg: Record<string, unknown>): void {
  sender?.(msg);
}

function armConnectTimeout(): void {
  disarmConnectTimeout();
  connectTimer = setTimeout(() => {
    const pc = window.__callPeer;
    if (pc && pc.connectionState !== "connected" && pc.connectionState !== "connecting") {
      console.warn("[calls] connection timeout");
      endWith("failed");
    }
  }, 45000);
}

function disarmConnectTimeout(): void {
  if (connectTimer) {
    clearTimeout(connectTimer);
    connectTimer = null;
  }
}

function getPeer(): RTCPeerConnection {
  const existing = window.__callPeer;
  if (existing) return existing;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      emit({
        action: "webrtc_candidate",
        target: targetUsername,
        call_id: activeCallId,
        candidate: e.candidate.toJSON(),
      });
    }
  };
  pc.onconnectionstatechange = () => {
    console.debug("[calls] connectionState:", pc.connectionState);
    if (pc.connectionState === "connected") {
      disarmConnectTimeout();
      handlers.onPhase?.("active");
    } else if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed" ||
      pc.connectionState === "disconnected"
    ) {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        handlers.onPhase?.("ended", "ended");
      }
    }
  };
  pc.ontrack = (e) => {
    console.debug("[calls] ontrack", e.track.kind);
    const stream = e.streams?.[0] ?? new MediaStream([e.track]);
    handlers.onRemoteStream?.(stream);
  };
  window.__callPeer = pc;
  return pc;
}

async function sendOffer(target: string, callId: string): Promise<void> {
  const pc = getPeer();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  emit({ action: "webrtc_offer", target, call_id: callId, sdp: pc.localDescription });
}

async function flushPending(pc: RTCPeerConnection): Promise<void> {
  if (pc.remoteDescription && pendingCandidates.length) {
    for (const c of pendingCandidates.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn("[calls] addIceCandidate failed:", err);
      }
    }
  }
}

function stopLocal(): void {
  if (myStream) {
    myStream.getTracks().forEach((t) => t.stop());
    myStream = null;
  }
}

let acceptedCallIds = new Set<string>();
let offeredCallIds = new Set<string>();
let hangupSentFor = "";
let answeredCallIds = new Set<string>();

export function cleanupCall(): void {
  const pc = window.__callPeer;
  if (pc) {
    pc.close();
    delete window.__callPeer;
  }
  stopLocal();
  disarmConnectTimeout();
  pendingCandidates.length = 0;
  activeCallId = "";
  targetUsername = "";
}

function endWith(reason: string): void {
  if (activeCallId && targetUsername && hangupSentFor !== activeCallId) {
    hangupSentFor = activeCallId;
    emit({ action: "call_hangup", target: targetUsername, call_id: activeCallId });
  }
  cleanupCall();
  handlers.onPhase?.("ended", reason);
}

async function createLocalMedia(mode: CallMode): Promise<MediaStream> {
  if (myStream) return myStream;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mode === "video",
  });
  myStream = stream;
  return stream;
}

function addLocalTracks(pc: RTCPeerConnection, stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
}

export function setCallSender(fn: SignalSender | null): void {
  sender = fn;
}

export function setCallHandlers(next: CallHandlers): void {
  handlers = { ...handlers, ...next };
}

export function resetCalls(): void {
  cleanupCall();
}

export async function startCall(
  target: string,
  mode: CallMode,
  username: string
): Promise<{ stream: MediaStream; callId: string } | null> {
  myUsername = username;
  const callId = uid();
  activeCallId = callId;
  targetUsername = target;
  try {
    const stream = await createLocalMedia(mode);
    addLocalTracks(getPeer(), stream);
    emit({ action: "call_start", target, call_id: callId, mode });
    armConnectTimeout();
    return { stream, callId };
  } catch (err) {
    console.error("[calls] getUserMedia failed:", err);
    endWith("failed");
    return null;
  }
}

export async function acceptCall(
  peerUsername: string,
  callId: string,
  mode: CallMode,
  username: string
): Promise<MediaStream | null> {
  if (acceptedCallIds.has(callId)) return myStream;
  acceptedCallIds.add(callId);
  myUsername = username;
  activeCallId = callId;
  targetUsername = peerUsername;
  try {
    const stream = await createLocalMedia(mode);
    addLocalTracks(getPeer(), stream);
    handlers.onPhase?.("connecting");
    emit({ action: "call_accept", target: peerUsername, call_id: callId });
    armConnectTimeout();
    return stream;
  } catch (err) {
    console.error("[calls] getUserMedia failed:", err);
    endWith("failed");
    return null;
  }
}

export function rejectCall(peerUsername: string, callId: string): void {
  emit({ action: "call_reject", target: peerUsername, call_id: callId });
  cleanupCall();
  handlers.onPhase?.("ended", "rejected");
}

export function cancelCall(peerUsername: string, callId: string): void {
  emit({ action: "call_cancel", target: peerUsername, call_id: callId });
  cleanupCall();
  handlers.onPhase?.("ended", "cancelled");
}

export function hangupCall(peerUsername: string, callId: string): void {
  if (hangupSentFor === callId) return;
  hangupSentFor = callId;
  emit({ action: "call_hangup", target: peerUsername, call_id: callId });
  cleanupCall();
  handlers.onPhase?.("ended", "ended");
}

export function handleRemoteHangup(callId: string): void {
  if (activeCallId && activeCallId !== callId) return;
  endWith("ended");
}

export function handleCallIncoming(callId: string): void {
  activeCallId = callId;
}

export function handleCallReject(callId: string): void {
  if (activeCallId && activeCallId !== callId) return;
  endWith("rejected");
}

export function handleCallCancel(callId: string): void {
  if (activeCallId && activeCallId !== callId) return;
  endWith("cancelled");
}

export function handleBusy(callId: string): void {
  if (activeCallId && activeCallId !== callId) return;
  endWith("busy");
}

export function handleCallAccept(peerUsername: string, callId: string): void {
  if (activeCallId !== callId) return;
  if (offeredCallIds.has(callId)) return;
  offeredCallIds.add(callId);
  handlers.onPhase?.("connecting");
  void sendOffer(peerUsername, callId);
}

export async function handleCallOffer(
  from: string,
  sdp: RTCSessionDescriptionInit,
  callId: string
): Promise<void> {
  if (activeCallId !== callId) return;
  const pc = getPeer();
  if (pc.remoteDescription || pc.signalingState !== "stable") {
    console.debug("[calls] duplicate/overlapping offer ignored", callId);
    return;
  }
  await pc.setRemoteDescription(sdp);
  await flushPending(pc);
  if (myStream && pc.getSenders().length === 0) {
    addLocalTracks(pc, myStream);
  }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  emit({ action: "webrtc_answer", target: from, call_id: callId, sdp: pc.localDescription });
}

export async function handleCallAnswer(
  from: string,
  sdp: RTCSessionDescriptionInit,
  callId: string
): Promise<void> {
  if (activeCallId !== callId) return;
  const pc = window.__callPeer;
  if (!pc) return;
  if (pc.remoteDescription) {
    console.debug("[calls] duplicate answer ignored", callId);
    return;
  }
  targetUsername = from;
  await pc.setRemoteDescription(sdp);
  await flushPending(pc);
}

export async function handleCallCandidate(
  from: string,
  candidate: RTCIceCandidateInit,
  callId: string
): Promise<void> {
  if (activeCallId !== callId) return;
  const pc = window.__callPeer;
  if (!pc) return;
  if (pc.remoteDescription) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[calls] addIceCandidate failed:", err);
    }
  } else {
    pendingCandidates.push(candidate);
  }
}

declare global {
  interface Window {
    __callPeer?: RTCPeerConnection;
  }
}