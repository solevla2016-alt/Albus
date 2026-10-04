"use client";

type SignalSender = (msg: Record<string, unknown>) => void;

interface ScreenShareHandlers {
  onRemoteStream?: (username: string, stream: MediaStream) => void;
  onSessionStart?: (broadcaster: string) => void;
  onSessionEnd?: () => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:5.35.83.69:3478?transport=udp",
      username: "webrtc",
      credential: "jwchatturn1790185471",
    },
    {
      urls: "turn:5.35.83.69:3478?transport=tcp",
      username: "webrtc",
      credential: "jwchatturn1790185471",
    },
  ],
};

let sender: SignalSender | null = null;
let handlers: ScreenShareHandlers = {};
let myStream: MediaStream | null = null;
let myUsername = "";
const peers = new Map<string, RTCPeerConnection>();
const offered = new Set<string>();
const pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

function emit(msg: Record<string, unknown>): void {
  sender?.(msg);
}

function dropPeer(username: string): void {
  const pc = peers.get(username);
  if (pc) {
    pc.close();
    peers.delete(username);
  }
  offered.delete(username);
  pendingCandidates.delete(username);
}

function getPeer(username: string): RTCPeerConnection {
  const existing = peers.get(username);
  if (existing) return existing;

  const pc = new RTCPeerConnection(RTC_CONFIG);
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      emit({ action: "webrtc_candidate", target: username, candidate: e.candidate.toJSON() });
    }
  };
  pc.onconnectionstatechange = () => {
    console.debug("[screenShare]", username, "connectionState:", pc.connectionState);
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      dropPeer(username);
    }
  };
  pc.oniceconnectionstatechange = () => {
    console.debug("[screenShare]", username, "iceConnectionState:", pc.iceConnectionState);
  };
  pc.ontrack = (e) => {
    console.debug("[screenShare]", username, "ontrack", e.track.kind);
    const stream = e.streams?.[0] ?? new MediaStream([e.track]);
    handlers.onRemoteStream?.(username, stream);
  };
  peers.set(username, pc);
  return pc;
}

async function flushPending(username: string, pc: RTCPeerConnection): Promise<void> {
  const list = pendingCandidates.get(username);
  if (list && pc.remoteDescription) {
    pendingCandidates.delete(username);
    for (const c of list) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.warn("[screenShare] addIceCandidate failed:", err);
      }
    }
  }
}

function closePeers(): void {
  peers.forEach((pc) => pc.close());
  peers.clear();
  offered.clear();
  pendingCandidates.clear();
}

function stopMyStream(): void {
  if (myStream) {
    myStream.getTracks().forEach((t) => t.stop());
    myStream = null;
  }
  myUsername = "";
}

export function setSignalSender(fn: SignalSender | null): void {
  sender = fn;
}

export function setScreenShareHandlers(next: ScreenShareHandlers): void {
  handlers = next;
}

export function resetScreenShare(): void {
  closePeers();
  stopMyStream();
}

export async function startScreenShare(stream: MediaStream, username: string): Promise<void> {
  myStream = stream;
  myUsername = username;
  emit({ action: "screen_share_start" });
}

export function stopScreenShare(): void {
  stopMyStream();
  closePeers();
  emit({ action: "screen_share_stop" });
  handlers.onSessionEnd?.();
}

export function handleScreenStart(broadcaster: string): void {
  if (broadcaster === myUsername) return;
  handlers.onSessionStart?.(broadcaster);
  void acceptScreenShare(broadcaster);
}

export function handleScreenStop(): void {
  closePeers();
  stopMyStream();
  handlers.onSessionEnd?.();
}

export function leaveScreenShare(): void {
  closePeers();
  handlers.onSessionEnd?.();
}

async function acceptScreenShare(broadcaster: string): Promise<void> {
  if (offered.has(broadcaster)) return;
  offered.add(broadcaster);
  const pc = getPeer(broadcaster);
  pc.addTransceiver("audio", { direction: "recvonly" });
  pc.addTransceiver("video", { direction: "recvonly" });
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  emit({ action: "webrtc_offer", target: broadcaster, sdp: pc.localDescription });
}

export async function handleOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
  let pc = getPeer(from);
  if (pc.remoteDescription || pc.signalingState !== "stable") {
    dropPeer(from);
    pc = getPeer(from);
  }
  await pc.setRemoteDescription(sdp);
  await flushPending(from, pc);
  if (myStream) {
    for (const track of myStream.getTracks()) {
      pc.addTrack(track, myStream);
    }
    for (const tr of pc.getTransceivers()) {
      if (tr.sender?.track && tr.direction !== "sendrecv") {
        tr.direction = "sendonly";
      }
    }
  }
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  emit({ action: "webrtc_answer", target: from, sdp: pc.localDescription });
}

export async function handleAnswer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
  const pc = peers.get(from);
  if (!pc) return;
  await pc.setRemoteDescription(sdp);
  await flushPending(from, pc);
}

export async function handleCandidate(from: string, candidate: RTCIceCandidateInit): Promise<void> {
  const pc = peers.get(from);
  if (!pc) return;
  if (pc.remoteDescription) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (err) {
      console.warn("[screenShare] addIceCandidate failed:", err);
    }
  } else {
    const list = pendingCandidates.get(from) ?? [];
    list.push(candidate);
    pendingCandidates.set(from, list);
  }
}