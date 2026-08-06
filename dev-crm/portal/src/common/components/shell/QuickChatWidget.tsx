"use client";

import { CSSProperties, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Maximize2,
  MessageCircle,
  Minimize2,
  MonitorOff,
  MonitorUp,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Send,
  Volume2,
  VolumeX,
  Video,
  ChevronDown,
  Users,
  X,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import api from '@/lib/suite/api';
import { API_HOST_URL } from "@/lib/api/config";
import { getJwtSubjectFromBrowser } from "@/lib/jwt-subject";
import { playNotificationSound } from "@/lib/playNotificationSound";
import {
  getBrowserRtcIceServers,
} from "@/lib/webrtc-ice-servers";

type ChatUser = {
  _id?: string;
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  fullName?: string;
};

type QuickChatMessage = {
  id: string;
  fromUserId: string;
  toUserId: string;
  text: string;
  createdAt: string;
  readBy?: string[];
};

type QuickChatConversation = {
  conversationKey: string;
  peerUser: ChatUser | null;
  lastMessage: QuickChatMessage;
  unreadCount: number;
  peerLastSeenAt: string | null;
  peerLastTypingAt: string | null;
};

type AdminQuickChatPresence = {
  activeCalls: { users: string[]; startedAt: string }[];
  activeHuddles: { roomId: string; participants: string[] }[];
  generatedAt?: string;
};

type HuddleParticipantState = {
  muted: boolean;
  speaking: boolean;
};
type HuddleConnectionState = "connected" | "connecting" | "reconnecting" | "failed" | "unknown";
type VirtualOfficeRoom = {
  name: string;
  mode: "external" | "huddle";
  provider?: string;
  link?: string;
  huddleRoomId?: string;
  purpose?: string;
  alwaysLive?: boolean;
};

type ScreenShareDiagnostics = {
  supported: boolean;
  permissionState: "granted" | "denied" | "prompt" | "unknown";
  streamActive: boolean;
  videoTrackReadyState: string;
  peersReceivingEstimate: number;
  lastError: string;
};

type ConnectionQuality = {
  label: "Good" | "Fair" | "Poor" | "Unknown";
  rttMs: number | null;
};

type DeviceOption = { id: string; label: string };
type OpsIncident = { at: string; level: "info" | "warn" | "error"; message: string };

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const SCREEN_SHARE_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    frameRate: { ideal: 12, max: 15 },
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
  },
  audio: false,
};
const LOW_END_SCREEN_SHARE_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    frameRate: { ideal: 8, max: 10 },
    width: { ideal: 960, max: 960 },
    height: { ideal: 540, max: 540 },
  },
  audio: false,
};

const RTC_ICE_SERVERS = getBrowserRtcIceServers();
const HAS_TURN_CONFIGURED = RTC_ICE_SERVERS.some((server) => {
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.some((url) => String(url || "").toLowerCase().startsWith("turn:") || String(url || "").toLowerCase().startsWith("turns:"));
});
const MAX_RENDERED_MESSAGES = 200;
const INITIAL_VISIBLE_CONVERSATIONS = 40;
const INITIAL_VISIBLE_DISCOVERY_CONTACTS = 30;
const LIST_INCREMENT = 40;
const MESSAGE_ALERT_VOLUME_MULTIPLIER = 1.8;
const HUDDLE_RETRY_COOLDOWN_MS = 3000;

const rtcConfiguration = (): RTCConfiguration => ({
  iceServers: RTC_ICE_SERVERS,
  iceCandidatePoolSize: 10,
});

function resolveUserId(user: ChatUser | null): string {
  if (!user) return "";
  return String(user._id || user.id || "");
}

function resolveUserName(user: ChatUser | null): string {
  if (!user) return "Unknown";
  const full = user.fullName?.trim();
  if (full) return full;
  const combined = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  if (combined) return combined;
  return user.email || "Unknown";
}

function initialsFromName(name: string): string {
  const clean = String(name || "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function QuickChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [contacts, setContacts] = useState<ChatUser[]>([]);
  const [conversations, setConversations] = useState<QuickChatConversation[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);
  const [messages, setMessages] = useState<QuickChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [myUser, setMyUser] = useState<ChatUser | null>(null);
  const [typingByUser, setTypingByUser] = useState<Record<string, string>>({});
  const [callStatus, setCallStatus] = useState<
    "idle" | "calling" | "incoming" | "connecting" | "in-call"
  >("idle");
  const [incomingFromUserId, setIncomingFromUserId] = useState<string | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<RTCSessionDescriptionInit | null>(null);
  const [huddleRoomId, setHuddleRoomId] = useState<string | null>(null);
  const [lastHuddleRoomId, setLastHuddleRoomId] = useState<string | null>(null);
  const [huddleParticipants, setHuddleParticipants] = useState<string[]>([]);
  const [huddleParticipantNames, setHuddleParticipantNames] = useState<Record<string, string>>({});
  const [huddleParticipantStates, setHuddleParticipantStates] = useState<
    Record<string, HuddleParticipantState>
  >({});
  const [huddleConnectionStates, setHuddleConnectionStates] = useState<
    Record<string, HuddleConnectionState>
  >({});
  const [isHuddleMicMuted, setIsHuddleMicMuted] = useState(false);
  const [quickChatOnlineUserIds, setQuickChatOnlineUserIds] = useState<string[]>([]);
  const [screenShareDiagnostics, setScreenShareDiagnostics] = useState<ScreenShareDiagnostics>({
    supported: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
    permissionState: "unknown",
    streamActive: false,
    videoTrackReadyState: "n/a",
    peersReceivingEstimate: 0,
    lastError: "",
  });
  const [isScreenShareTestRunning, setIsScreenShareTestRunning] = useState(false);
  const [isScreenSharePreflightOpen, setIsScreenSharePreflightOpen] = useState(false);
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>({
    label: "Unknown",
    rttMs: null,
  });
  const [autoRejoinRoomId, setAutoRejoinRoomId] = useState<string | null>(null);
  const [autoRejoinAttempt, setAutoRejoinAttempt] = useState(0);
  const [isDndEnabled, setIsDndEnabled] = useState(false);
  const [inputDevices, setInputDevices] = useState<DeviceOption[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceOption[]>([]);
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("");
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [opsIncidents, setOpsIncidents] = useState<OpsIncident[]>([]);
  const [supportsSetSinkId, setSupportsSetSinkId] = useState(false);
  const [supportsPermissionsApi, setSupportsPermissionsApi] = useState(false);
  const [huddleInvite, setHuddleInvite] = useState<{ roomId: string; fromUserId: string } | null>(null);
  const [availableHuddleRooms, setAvailableHuddleRooms] = useState<
    { roomId: string; participantCount: number }[]
  >([]);
  const [huddleJoinPendingRoomId, setHuddleJoinPendingRoomId] = useState<string | null>(null);
  const [huddleJoinRequests, setHuddleJoinRequests] = useState<
    {
      roomId: string;
      requesterUserId: string;
      requesterName?: string;
      requesterSocketId?: string;
      requesterIsGuest?: boolean;
    }[]
  >([]);
  const [quickHuddleUserIds, setQuickHuddleUserIds] = useState<string[]>([]);
  const [huddleInviteUserIds, setHuddleInviteUserIds] = useState<string[]>([]);
  const [adminPresence, setAdminPresence] = useState<AdminQuickChatPresence>({
    activeCalls: [],
    activeHuddles: [],
  });
  const [callNotice, setCallNotice] = useState("");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [hasRemoteScreenShare, setHasRemoteScreenShare] = useState(false);
  const [huddleRemoteScreens, setHuddleRemoteScreens] = useState<string[]>([]);
  const [retryCooldownTick, setRetryCooldownTick] = useState(0);
  const [isJoiningHuddle, setIsJoiningHuddle] = useState(false);
  const [isTogglingHuddleMute, setIsTogglingHuddleMute] = useState(false);
  const [isScreenShareBusy, setIsScreenShareBusy] = useState(false);
  const [virtualOfficeRooms, setVirtualOfficeRooms] = useState<VirtualOfficeRoom[]>([]);
  const [isVirtualOfficeLoading, setIsVirtualOfficeLoading] = useState(false);
  const [isWorkspaceMode, setIsWorkspaceMode] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isSuiteSidebarCollapsed, setIsSuiteSidebarCollapsed] = useState(true);
  const [isQuickHuddlePanelOpen, setIsQuickHuddlePanelOpen] = useState(true);
  const [isQuickChatSettingsOpen, setIsQuickChatSettingsOpen] = useState(false);
  const [leftPanelTab, setLeftPanelTab] = useState<"chats" | "presence">("chats");
  const [ringtoneVolume, setRingtoneVolume] = useState(1.4);
  const [lowEndModeEnabled, setLowEndModeEnabled] = useState(false);
  const [visibleConversationCount, setVisibleConversationCount] = useState(
    INITIAL_VISIBLE_CONVERSATIONS,
  );
  const [visibleDiscoveryContactCount, setVisibleDiscoveryContactCount] = useState(
    INITIAL_VISIBLE_DISCOVERY_CONTACTS,
  );
  const socketRef = useRef<Socket | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localScreenPreviewRef = useRef<HTMLVideoElement | null>(null);
  const screenShareTestPreviewRef = useRef<HTMLVideoElement | null>(null);
  const huddleRoomIdRef = useRef<string | null>(null);
  const huddleLocalStreamRef = useRef<MediaStream | null>(null);
  const huddlePeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const huddleRemoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const huddleRemoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const huddleRemoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const huddlePendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const huddleMakingOfferRef = useRef<Map<string, boolean>>(new Map());
  const huddleNeedsOfferRef = useRef<Map<string, boolean>>(new Map());
  const huddleRetryCooldownRef = useRef<Map<string, number>>(new Map());
  const huddleAudioContextRef = useRef<AudioContext | null>(null);
  const huddleAudioMetersRef = useRef<Map<string, { stop: () => void }>>(new Map());
  const huddleSpeakingRef = useRef<Map<string, boolean>>(new Map());
  const ringtoneIntervalRef = useRef<number | null>(null);
  const unreadMessageAlertIntervalRef = useRef<number | null>(null);
  const quickCallPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const quickCallNeedsOfferRef = useRef(false);
  const quickCallDisconnectTimeoutRef = useRef<number | null>(null);
  const quickCallIceRestartAttemptedRef = useRef(false);
  const screenShareTestStreamRef = useRef<MediaStream | null>(null);
  const autoRejoinTimeoutRef = useRef<number | null>(null);
  const deviceMicMonitorContextRef = useRef<AudioContext | null>(null);
  const deviceMicMonitorRafRef = useRef<number | null>(null);
  const deviceMicMonitorStreamRef = useRef<MediaStream | null>(null);

  const myUserId = useMemo(() => {
    const fromJwt = getJwtSubjectFromBrowser();
    if (fromJwt) return String(fromJwt);
    return resolveUserId(myUser);
  }, [myUser]);

  const selectedUserId = resolveUserId(selectedUser);
  const selectedUserIdRef = useRef("");
  useEffect(() => {
    selectedUserIdRef.current = selectedUserId;
  }, [selectedUserId]);
  const isAdminLikeUser = useMemo(() => {
    const roleRaw = (myUser as any)?.role;
    const roleName =
      typeof roleRaw === "string"
        ? roleRaw
        : typeof roleRaw?.name === "string"
          ? roleRaw.name
          : "";
    return new Set(["ADMIN", "ADMINISTRATOR", "SUPERADMIN", "SUPER_ADMIN", "OWNER", "CEO", "CTO", "MANAGER", "HR"]).has(
      String(roleName).toUpperCase(),
    );
  }, [myUser]);
  const selectedPeerTypingAt = selectedUserId ? typingByUser[selectedUserId] : null;
  const isPeerTyping =
    !!selectedPeerTypingAt &&
    Date.now() - new Date(selectedPeerTypingAt).getTime() < 3000;

  const getUserNameById = (userId: string) => {
    if (!userId) return "Teammate";
    if (huddleParticipantNames[userId]) return huddleParticipantNames[userId];
    const fromContacts = contacts.find((contact) => resolveUserId(contact) === userId);
    if (fromContacts) return resolveUserName(fromContacts);
    const fromConversations = conversations.find(
      (conversation) => resolveUserId(conversation.peerUser) === userId,
    )?.peerUser;
    if (fromConversations) return resolveUserName(fromConversations);
    if (selectedUserId === userId && selectedUser) return resolveUserName(selectedUser);
    return "Teammate";
  };
  const normalizeMeetingLink = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  };
  const isUserOnline = (userId: string) =>
    !!userId && quickChatOnlineUserIds.includes(userId);
  const availabilityStatus = huddleRoomId
    ? "In huddle"
    : callStatus === "in-call" || callStatus === "connecting"
      ? "In call"
      : isDndEnabled
        ? "Do not disturb"
        : "Available";

  const pushOpsIncident = (level: OpsIncident["level"], message: string) => {
    const next: OpsIncident = { at: new Date().toISOString(), level, message };
    setOpsIncidents((prev) => [next, ...prev].slice(0, 30));
  };

  const loadVirtualOfficeRooms = async () => {
    setIsVirtualOfficeLoading(true);
    try {
      const res = await api.get("/projects/virtual-office-rooms");
      const rooms = Array.isArray((res.data as any)?.virtualOfficeRooms)
        ? ((res.data as any).virtualOfficeRooms as VirtualOfficeRoom[])
        : [];
      setVirtualOfficeRooms(rooms);
    } catch {
      setVirtualOfficeRooms([]);
    } finally {
      setIsVirtualOfficeLoading(false);
    }
  };
  const isDisplayCaptureSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const logQuickCallSignal = (
    event: string,
    data?: Record<string, unknown>,
    peerConnection?: RTCPeerConnection | null,
  ) => {
    const pc = peerConnection || peerConnectionRef.current;
    console.info("[QuickCall][Signal]", event, {
      ...data,
      signalingState: pc?.signalingState,
      connectionState: pc?.connectionState,
      iceConnectionState: pc?.iceConnectionState,
      iceGatheringState: pc?.iceGatheringState,
      hasRemoteDescription: !!pc?.remoteDescription,
      hasLocalDescription: !!pc?.localDescription,
    });
  };

  const loadConversations = async () => {
    try {
      const response = await api.get("/quick-chat/conversations");
      setConversations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load quick chat conversations:", error);
    }
  };

  const startRingtone = () => {
    if (ringtoneIntervalRef.current) return;
    playNotificationSound("ringtone", { volumeMultiplier: ringtoneVolume });
    ringtoneIntervalRef.current = window.setInterval(() => {
      playNotificationSound("ringtone", { volumeMultiplier: ringtoneVolume });
    }, 1100);
  };

  const stopRingtone = () => {
    if (!ringtoneIntervalRef.current) return;
    window.clearInterval(ringtoneIntervalRef.current);
    ringtoneIntervalRef.current = null;
  };

  const testRingtone = () => {
    playNotificationSound("ringtone", { volumeMultiplier: ringtoneVolume });
  };

  const startUnreadMessageAlert = () => {
    if (unreadMessageAlertIntervalRef.current) return;
    playNotificationSound("default", {
      volumeMultiplier: Math.max(MESSAGE_ALERT_VOLUME_MULTIPLIER, ringtoneVolume),
    });
    unreadMessageAlertIntervalRef.current = window.setInterval(() => {
      playNotificationSound("default", {
        volumeMultiplier: Math.max(MESSAGE_ALERT_VOLUME_MULTIPLIER, ringtoneVolume),
      });
    }, 1800);
  };

  const stopUnreadMessageAlert = () => {
    if (!unreadMessageAlertIntervalRef.current) return;
    window.clearInterval(unreadMessageAlertIntervalRef.current);
    unreadMessageAlertIntervalRef.current = null;
  };

  const openVideoFullscreen = (video: HTMLVideoElement | null) => {
    if (!video) return;
    const anyVideo = video as HTMLVideoElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    if (typeof anyVideo.requestFullscreen === "function") {
      void anyVideo.requestFullscreen();
      return;
    }
    if (typeof anyVideo.webkitRequestFullscreen === "function") {
      void anyVideo.webkitRequestFullscreen();
      return;
    }
    if (typeof anyVideo.msRequestFullscreen === "function") {
      void anyVideo.msRequestFullscreen();
    }
  };

  const refreshScreenShareDiagnostics = () => {
    const stream = screenShareStreamRef.current;
    const videoTrack = stream?.getVideoTracks()?.[0] || null;
    const quickCallPeers = selectedUserId && (callStatus === "in-call" || callStatus === "connecting") ? 1 : 0;
    const huddlePeers = huddleRoomIdRef.current ? huddlePeerConnectionsRef.current.size : 0;
    setScreenShareDiagnostics((prev) => ({
      ...prev,
      supported: typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia,
      streamActive: !!stream && stream.active,
      videoTrackReadyState: videoTrack?.readyState || "none",
      peersReceivingEstimate: quickCallPeers + huddlePeers,
    }));
  };

  const listAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
      const speakers = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d, i) => ({ id: d.deviceId, label: d.label || `Speaker ${i + 1}` }));
      setInputDevices(mics);
      setOutputDevices(speakers);
      if (!selectedInputDeviceId && mics[0]?.id) setSelectedInputDeviceId(mics[0].id);
      if (!selectedOutputDeviceId && speakers[0]?.id) setSelectedOutputDeviceId(speakers[0].id);
      const sinkSupported =
        typeof document !== "undefined" &&
        typeof (document.createElement("audio") as any).setSinkId === "function";
      setSupportsSetSinkId(sinkSupported);
    } catch {
      pushOpsIncident("warn", "Device enumeration failed.");
    }
  };

  const startMicLevelMonitor = async () => {
    try {
      if (deviceMicMonitorRafRef.current) {
        window.cancelAnimationFrame(deviceMicMonitorRafRef.current);
        deviceMicMonitorRafRef.current = null;
      }
      if (deviceMicMonitorStreamRef.current) {
        deviceMicMonitorStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInputDeviceId
          ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: selectedInputDeviceId } }
          : AUDIO_CONSTRAINTS,
        video: false,
      });
      deviceMicMonitorStreamRef.current = stream;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (deviceMicMonitorContextRef.current) {
        void deviceMicMonitorContextRef.current.close();
      }
      const ctx = new Ctx();
      deviceMicMonitorContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) sum += data[i];
        const avg = sum / Math.max(1, data.length);
        setMicLevel(Math.min(100, Math.round((avg / 80) * 100)));
        deviceMicMonitorRafRef.current = window.requestAnimationFrame(tick);
      };
      deviceMicMonitorRafRef.current = window.requestAnimationFrame(tick);
    } catch {
      setMicLevel(0);
      pushOpsIncident("warn", "Mic monitor unavailable. Check mic permission.");
    }
  };

  const testSpeaker = async () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.08;
      osc.frequency.value = 740;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
      setCallNotice("Speaker test played.");
      pushOpsIncident("info", "Speaker echo test executed.");
      window.setTimeout(() => void ctx.close(), 350);
    } catch {
      setCallNotice("Speaker test failed.");
      pushOpsIncident("warn", "Speaker test failed.");
    }
  };

  const applyOutputDevice = async () => {
    if (!selectedOutputDeviceId) return;
    if (!supportsSetSinkId) return;
    const setSink = async (el: HTMLMediaElement | null) => {
      if (!el) return;
      const anyEl = el as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };
      if (typeof anyEl.setSinkId === "function") {
        try {
          await anyEl.setSinkId(selectedOutputDeviceId);
        } catch {
          pushOpsIncident("warn", "Failed to apply selected speaker output device.");
        }
      }
    };
    await setSink(remoteAudioRef.current);
    for (const audio of huddleRemoteAudioRefs.current.values()) {
      await setSink(audio);
    }
  };

  const stopScreenShareTest = () => {
    const stream = screenShareTestStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      screenShareTestStreamRef.current = null;
    }
    if (screenShareTestPreviewRef.current) {
      screenShareTestPreviewRef.current.srcObject = null;
    }
    setIsScreenShareTestRunning(false);
  };

  const runScreenSharePreflightTest = async () => {
    try {
      stopScreenShareTest();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        ...((lowEndModeEnabled
          ? LOW_END_SCREEN_SHARE_CONSTRAINTS
          : SCREEN_SHARE_CONSTRAINTS) as MediaStreamConstraints),
      });
      screenShareTestStreamRef.current = stream;
      setIsScreenSharePreflightOpen(true);
      setIsScreenShareTestRunning(true);
      if (screenShareTestPreviewRef.current) {
        screenShareTestPreviewRef.current.srcObject = stream;
      }
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShareTest();
          refreshScreenShareDiagnostics();
        };
      }
      setScreenShareDiagnostics((prev) => ({
        ...prev,
        lastError: "",
      }));
      refreshScreenShareDiagnostics();
      setCallNotice("Screen-share test started (local preview only).");
    } catch (error) {
      console.error("Failed to run screen-share preflight:", error);
      pushOpsIncident("error", "Screen-share preflight failed.");
      setScreenShareDiagnostics((prev) => ({
        ...prev,
        lastError: "Preflight failed: display capture denied or blocked.",
      }));
      refreshScreenShareDiagnostics();
      setCallNotice("Preflight failed. Check browser display-capture permission.");
    }
  };

  const clearAutoRejoinTimer = () => {
    if (!autoRejoinTimeoutRef.current) return;
    window.clearTimeout(autoRejoinTimeoutRef.current);
    autoRejoinTimeoutRef.current = null;
  };

  const cancelAutoRejoin = () => {
    clearAutoRejoinTimer();
    setAutoRejoinRoomId(null);
    setAutoRejoinAttempt(0);
  };

  const evaluateConnectionQuality = async () => {
    const connectionStates: string[] = [];
    const iceStates: string[] = [];
    const rtts: number[] = [];
    const pushConnectionState = (pc: RTCPeerConnection | null) => {
      if (!pc) return;
      connectionStates.push(pc.connectionState || "new");
      iceStates.push(pc.iceConnectionState || "new");
    };
    pushConnectionState(peerConnectionRef.current);
    huddlePeerConnectionsRef.current.forEach((pc) => pushConnectionState(pc));

    const readRtt = async (pc: RTCPeerConnection | null) => {
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach((report: any) => {
          if (
            report?.type === "candidate-pair" &&
            report?.state === "succeeded" &&
            typeof report?.currentRoundTripTime === "number"
          ) {
            rtts.push(report.currentRoundTripTime * 1000);
          }
        });
      } catch {
        // Ignore per-connection stats failures.
      }
    };
    await readRtt(peerConnectionRef.current);
    for (const pc of huddlePeerConnectionsRef.current.values()) {
      await readRtt(pc);
    }

    const avgRtt = rtts.length ? rtts.reduce((sum, value) => sum + value, 0) / rtts.length : null;
    const hasPoorState =
      connectionStates.some((state) => ["failed", "disconnected", "closed"].includes(state)) ||
      iceStates.some((state) => ["failed", "disconnected"].includes(state));
    let label: ConnectionQuality["label"] = "Unknown";
    if (hasPoorState) label = "Poor";
    else if (avgRtt !== null) {
      if (avgRtt <= 180) label = "Good";
      else if (avgRtt <= 420) label = "Fair";
      else label = "Poor";
    } else if (connectionStates.some((state) => state === "connected")) {
      label = "Good";
    }
    setConnectionQuality({
      label,
      rttMs: avgRtt === null ? null : Math.round(avgRtt),
    });
  };

  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });
      stream.getTracks().forEach((track) => track.stop());
      setCallNotice("Microphone is ready.");
    } catch (error: any) {
      if (error?.name === "NotAllowedError") {
        setCallNotice(
          "Microphone blocked. Enable mic permission in browser site settings.",
        );
        return;
      }
      if (error?.name === "NotFoundError") {
        setCallNotice("No microphone detected. Connect a mic and try again.");
        return;
      }
      setCallNotice("Could not access microphone. Please check device/audio settings.");
    }
  };

  const ensureHuddleAudioContext = () => {
    if (huddleAudioContextRef.current) return huddleAudioContextRef.current;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    huddleAudioContextRef.current = ctx;
    return ctx;
  };

  const emitHuddleParticipantState = (patch: Partial<HuddleParticipantState>) => {
    const roomId = huddleRoomIdRef.current;
    if (!roomId || !socketRef.current) return;
    socketRef.current.emit("huddle:participant-state", {
      roomId,
      ...patch,
    });
  };

  const tryPlayMediaElement = (element: HTMLMediaElement | null) => {
    if (!element) return;
    const maybePromise = element.play?.();
    if (maybePromise && typeof maybePromise.then === "function") {
      void maybePromise.catch(() => {});
    }
  };

  const setLocalHuddleSpeaking = (speaking: boolean) => {
    if (!myUserId) return;
    const previous = huddleSpeakingRef.current.get(myUserId) ?? false;
    if (previous === speaking) return;
    huddleSpeakingRef.current.set(myUserId, speaking);
    setHuddleParticipantStates((prev) => ({
      ...prev,
      [myUserId]: {
        muted: prev[myUserId]?.muted ?? isHuddleMicMuted,
        speaking,
      },
    }));
    emitHuddleParticipantState({ speaking });
  };

  const startHuddleAudioMeter = (participantId: string, stream: MediaStream) => {
    const existing = huddleAudioMetersRef.current.get(participantId);
    if (existing) {
      existing.stop();
      huddleAudioMetersRef.current.delete(participantId);
    }
    const ctx = ensureHuddleAudioContext();
    if (!ctx) return;
    const [track] = stream.getAudioTracks();
    if (!track) return;
    const audioStream = new MediaStream([track]);
    const source = ctx.createMediaStreamSource(audioStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    let rafId = 0;
    let speakingForTicks = 0;
    const threshold = participantId === myUserId ? 16 : 14;
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      let total = 0;
      for (let i = 0; i < samples.length; i += 1) total += samples[i];
      const avg = total / Math.max(1, samples.length);
      const detectedSpeaking = avg > threshold;
      speakingForTicks = detectedSpeaking ? Math.min(speakingForTicks + 1, 4) : Math.max(speakingForTicks - 1, 0);
      const speaking = speakingForTicks >= 2;
      if (participantId === myUserId) {
        if (!isHuddleMicMuted) setLocalHuddleSpeaking(speaking);
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    const stop = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      source.disconnect();
      analyser.disconnect();
      if (participantId === myUserId) {
        setLocalHuddleSpeaking(false);
      }
    };
    huddleAudioMetersRef.current.set(participantId, { stop });
  };

  const connectionLabelForState = (state?: RTCPeerConnectionState): HuddleConnectionState => {
    if (state === "connected") return "connected";
    if (state === "connecting" || state === "new") return "connecting";
    if (state === "disconnected") return "reconnecting";
    if (state === "failed" || state === "closed") return "failed";
    return "unknown";
  };

  const cleanupHuddle = () => {
    huddlePeerConnectionsRef.current.forEach((pc) => pc.close());
    huddlePeerConnectionsRef.current.clear();
    huddlePendingIceRef.current.clear();
    huddleMakingOfferRef.current.clear();
    huddleNeedsOfferRef.current.clear();
    huddleAudioMetersRef.current.forEach((meter) => meter.stop());
    huddleAudioMetersRef.current.clear();
    huddleSpeakingRef.current.clear();
    if (huddleAudioContextRef.current) {
      void huddleAudioContextRef.current.close();
      huddleAudioContextRef.current = null;
    }
    if (huddleLocalStreamRef.current) {
      huddleLocalStreamRef.current.getTracks().forEach((track) => track.stop());
      huddleLocalStreamRef.current = null;
    }
    huddleRemoteAudioRefs.current.forEach((audio) => {
      audio.srcObject = null;
    });
    huddleRemoteAudioRefs.current.clear();
    huddleRemoteVideoRefs.current.forEach((video) => {
      video.srcObject = null;
    });
    huddleRemoteVideoRefs.current.clear();
    huddleRemoteStreamsRef.current.clear();
    setHuddleParticipants([]);
    setHuddleParticipantNames({});
    setHuddleParticipantStates({});
    setHuddleConnectionStates({});
    setIsHuddleMicMuted(false);
    setHuddleRemoteScreens([]);
    setHuddleRoomId(null);
    setHuddleJoinPendingRoomId(null);
    setHuddleJoinRequests([]);
    huddleRoomIdRef.current = null;
  };

  const ensureHuddleLocalAudio = async () => {
    if (huddleLocalStreamRef.current) return huddleLocalStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: selectedInputDeviceId
        ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: selectedInputDeviceId } }
        : AUDIO_CONSTRAINTS,
      video: false,
    });
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isHuddleMicMuted;
    });
    huddleLocalStreamRef.current = stream;
    startHuddleAudioMeter(myUserId, stream);
    return stream;
  };

  const getHuddlePeerConnection = async (peerUserId: string) => {
    const existing = huddlePeerConnectionsRef.current.get(peerUserId);
    if (existing) return existing;
    const peerConnection = new RTCPeerConnection(rtcConfiguration());
    const local = await ensureHuddleLocalAudio();
    local.getTracks().forEach((track) => {
      peerConnection.addTrack(track, local);
    });
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach((track) => {
        peerConnection.addTrack(track, screenShareStreamRef.current as MediaStream);
      });
    }
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) return;
      const roomId = huddleRoomIdRef.current;
      if (!roomId) return;
      socketRef.current.emit("huddle:signal", {
        roomId,
        toUserId: peerUserId,
        candidate: event.candidate.toJSON(),
      });
    };
    peerConnection.ontrack = (event) => {
      const [stream] = event.streams;
      if (!stream) return;
      huddleRemoteStreamsRef.current.set(peerUserId, stream);
      startHuddleAudioMeter(peerUserId, stream);
      const audioEl = huddleRemoteAudioRefs.current.get(peerUserId);
      if (audioEl) {
        audioEl.srcObject = stream;
        tryPlayMediaElement(audioEl);
      }
      const videoEl = huddleRemoteVideoRefs.current.get(peerUserId);
      const hasVideo = stream.getVideoTracks().length > 0;
      if (videoEl && hasVideo) {
        videoEl.srcObject = stream;
      }
      setHuddleRemoteScreens((prev) =>
        hasVideo ? (prev.includes(peerUserId) ? prev : [...prev, peerUserId]) : prev,
      );
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          setHuddleRemoteScreens((prev) => prev.filter((id) => id !== peerUserId));
        };
      });
    };
    peerConnection.onconnectionstatechange = () => {
      const connectionLabel = connectionLabelForState(peerConnection.connectionState);
      setHuddleConnectionStates((prev) => ({
        ...prev,
        [peerUserId]: connectionLabel,
      }));
      if (
        ["failed", "disconnected", "closed"].includes(peerConnection.connectionState)
      ) {
        peerConnection.close();
        huddlePeerConnectionsRef.current.delete(peerUserId);
        huddleMakingOfferRef.current.delete(peerUserId);
        huddleNeedsOfferRef.current.delete(peerUserId);
      }
    };
    peerConnection.onsignalingstatechange = () => {
      const roomId = huddleRoomIdRef.current;
      if (!roomId) return;
      if (peerConnection.signalingState !== "stable") return;
      if (!huddleNeedsOfferRef.current.get(peerUserId)) return;
      huddleNeedsOfferRef.current.set(peerUserId, false);
      void createHuddleOfferTo(peerUserId, roomId);
    };
    huddlePeerConnectionsRef.current.set(peerUserId, peerConnection);
    return peerConnection;
  };

  const createHuddleOfferTo = async (peerUserId: string, roomId: string) => {
    const peerConnection = await getHuddlePeerConnection(peerUserId);
    if (huddleMakingOfferRef.current.get(peerUserId)) {
      huddleNeedsOfferRef.current.set(peerUserId, true);
      return;
    }
    if (peerConnection.signalingState !== "stable") {
      huddleNeedsOfferRef.current.set(peerUserId, true);
      return;
    }
    huddleMakingOfferRef.current.set(peerUserId, true);
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socketRef.current?.emit("huddle:signal", {
        roomId,
        toUserId: peerUserId,
        description: offer,
      });
    } finally {
      huddleMakingOfferRef.current.set(peerUserId, false);
    }
  };

  const retryHuddlePeerConnection = async (peerUserId: string) => {
    const roomId = huddleRoomIdRef.current;
    if (!roomId || !peerUserId || peerUserId === myUserId) return;
    const now = Date.now();
    const nextAllowedAt = huddleRetryCooldownRef.current.get(peerUserId) || 0;
    if (now < nextAllowedAt) {
      setCallNotice("Retry is cooling down. Please wait a moment.");
      return;
    }
    huddleRetryCooldownRef.current.set(peerUserId, now + HUDDLE_RETRY_COOLDOWN_MS);
    const existing = huddlePeerConnectionsRef.current.get(peerUserId);
    if (existing) {
      existing.close();
      huddlePeerConnectionsRef.current.delete(peerUserId);
      huddleMakingOfferRef.current.delete(peerUserId);
      huddleNeedsOfferRef.current.delete(peerUserId);
    }
    setHuddleConnectionStates((prev) => ({
      ...prev,
      [peerUserId]: "connecting",
    }));
    try {
      await createHuddleOfferTo(peerUserId, roomId);
      setCallNotice(`Retrying connection with ${getUserNameById(peerUserId)}...`);
    } catch (error) {
      console.error("Failed to retry huddle peer connection:", error);
      setHuddleConnectionStates((prev) => ({
        ...prev,
        [peerUserId]: "failed",
      }));
      setCallNotice(`Could not retry ${getUserNameById(peerUserId)} connection.`);
    }
  };

  const createQuickCallOfferTo = async (peerUserId: string, iceRestart = false) => {
    if (!socketRef.current || !peerConnectionRef.current) return;
    if (peerConnectionRef.current.signalingState !== "stable") {
      quickCallNeedsOfferRef.current = true;
      return;
    }
    const offer = await peerConnectionRef.current.createOffer(
      iceRestart ? { iceRestart: true } : undefined,
    );
    await peerConnectionRef.current.setLocalDescription(offer);
    quickCallNeedsOfferRef.current = false;
    socketRef.current.emit("quick-call:offer", { toUserId: peerUserId, offer });
  };

  const tuneVideoSender = async (sender: RTCRtpSender | null) => {
    if (!sender) return;
    try {
      const params = sender.getParameters();
      const next = { ...params };
      const enc = next.encodings?.length ? [...next.encodings] : [{}];
      enc[0] = {
        ...enc[0],
        // Keep screen-share low-latency and lightweight for quick calls/huddles.
        maxBitrate: lowEndModeEnabled ? 420_000 : 900_000,
        maxFramerate: lowEndModeEnabled ? 10 : 15,
      };
      next.encodings = enc;
      await sender.setParameters(next);
    } catch (error) {
      console.warn("Unable to tune video sender params:", error);
    }
  };

  const stopScreenShare = async () => {
    if (isScreenShareBusy) return;
    setIsScreenShareBusy(true);
    const stream = screenShareStreamRef.current;
    try {
      if (!stream) return;
      stream.getTracks().forEach((track) => track.stop());
      screenShareStreamRef.current = null;
      setIsScreenSharing(false);
      if (localScreenPreviewRef.current) {
        localScreenPreviewRef.current.srcObject = null;
      }

      if (selectedUserId && peerConnectionRef.current) {
        const quickVideoSenders = peerConnectionRef.current
          .getSenders()
          .filter((sender) => sender.track?.kind === "video");
        quickVideoSenders.forEach((sender) => peerConnectionRef.current?.removeTrack(sender));
        if (callStatus === "in-call" || callStatus === "connecting") {
          await createQuickCallOfferTo(selectedUserId);
        }
      }

      const roomId = huddleRoomIdRef.current;
      if (roomId) {
        const huddlePeers = Array.from(huddlePeerConnectionsRef.current.entries());
        for (const [peerId, connection] of huddlePeers) {
          const videoSenders = connection
            .getSenders()
            .filter((sender) => sender.track?.kind === "video");
          videoSenders.forEach((sender) => connection.removeTrack(sender));
          await createHuddleOfferTo(peerId, roomId);
        }
      }
      refreshScreenShareDiagnostics();
    } finally {
      setIsScreenShareBusy(false);
    }
  };

  const startScreenShare = async () => {
    if (isScreenShareBusy) return;
    setIsScreenShareBusy(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        ...((lowEndModeEnabled
          ? LOW_END_SCREEN_SHARE_CONSTRAINTS
          : SCREEN_SHARE_CONSTRAINTS) as MediaStreamConstraints),
      });
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) return;
      screenShareStreamRef.current = stream;
      setIsScreenSharing(true);
      if (localScreenPreviewRef.current) {
        localScreenPreviewRef.current.srcObject = stream;
      }

      videoTrack.onended = () => {
        void stopScreenShare();
      };

      if (selectedUserId && peerConnectionRef.current) {
        const sender = peerConnectionRef.current.addTrack(videoTrack, stream);
        void tuneVideoSender(sender);
        if (callStatus === "in-call" || callStatus === "connecting") {
          await createQuickCallOfferTo(selectedUserId);
        }
      }

      if (huddleRoomIdRef.current) {
        const roomId = huddleRoomIdRef.current;
        const huddlePeers = Array.from(huddlePeerConnectionsRef.current.entries());
        for (const [peerId, connection] of huddlePeers) {
          const sender = connection.addTrack(videoTrack, stream);
          void tuneVideoSender(sender);
          await createHuddleOfferTo(peerId, roomId);
        }
      }
      setScreenShareDiagnostics((prev) => ({
        ...prev,
        lastError: "",
      }));
      refreshScreenShareDiagnostics();
    } catch (error) {
      console.error("Failed to start screen share:", error);
      setCallNotice("Screen share permission denied or unavailable.");
      pushOpsIncident("error", "Screen share start failed.");
      setIsScreenSharing(false);
      setScreenShareDiagnostics((prev) => ({
        ...prev,
        lastError: "Permission denied or browser blocked display capture.",
      }));
      refreshScreenShareDiagnostics();
    } finally {
      setIsScreenShareBusy(false);
    }
  };

  const getOrCreatePeerConnection = (peerUserId: string) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    const peerConnection = new RTCPeerConnection(rtcConfiguration());
    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !socketRef.current) return;
      logQuickCallSignal(
        "local-ice-candidate",
        { toUserId: peerUserId, candidateType: event.candidate.type || "unknown" },
        peerConnection,
      );
      socketRef.current.emit("quick-call:ice-candidate", {
        toUserId: peerUserId,
        candidate: event.candidate.toJSON(),
      });
    };
    peerConnection.ontrack = (event) => {
      if (!remoteAudioRef.current) return;
      const [stream] = event.streams;
      if (stream) {
        remoteAudioRef.current.srcObject = stream;
        tryPlayMediaElement(remoteAudioRef.current);
        const hasVideo = stream.getVideoTracks().length > 0;
        setHasRemoteScreenShare(hasVideo);
        if (remoteVideoRef.current && hasVideo) {
          remoteVideoRef.current.srcObject = stream;
        }
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => setHasRemoteScreenShare(false);
        });
      }
    };
    peerConnection.onconnectionstatechange = () => {
      logQuickCallSignal("connection-state-change", undefined, peerConnectionRef.current);
      if (
        quickCallNeedsOfferRef.current &&
        selectedUserIdRef.current &&
        peerConnectionRef.current?.signalingState === "stable"
      ) {
        void createQuickCallOfferTo(selectedUserIdRef.current);
      }
      if (!peerConnectionRef.current) return;
      if (peerConnectionRef.current.connectionState === "connected") {
        if (quickCallDisconnectTimeoutRef.current) {
          window.clearTimeout(quickCallDisconnectTimeoutRef.current);
          quickCallDisconnectTimeoutRef.current = null;
        }
        quickCallIceRestartAttemptedRef.current = false;
        setCallStatus("in-call");
      } else if (peerConnectionRef.current.connectionState === "disconnected") {
        // "disconnected" can be transient on weak networks; avoid immediate hard hangup.
        if (quickCallDisconnectTimeoutRef.current) {
          window.clearTimeout(quickCallDisconnectTimeoutRef.current);
        }
        quickCallDisconnectTimeoutRef.current = window.setTimeout(() => {
          if (!peerConnectionRef.current) return;
          if (peerConnectionRef.current.connectionState === "disconnected") {
            endCall("connection-closed");
          }
        }, 5000);
      } else if (
        ["failed", "closed"].includes(peerConnectionRef.current.connectionState)
      ) {
        if (
          peerConnectionRef.current.connectionState === "failed" &&
          !quickCallIceRestartAttemptedRef.current &&
          peerConnectionRef.current.signalingState === "stable"
        ) {
          quickCallIceRestartAttemptedRef.current = true;
          if (HAS_TURN_CONFIGURED) {
            peerConnectionRef.current.setConfiguration({
              ...rtcConfiguration(),
              iceTransportPolicy: "relay",
            });
            setCallNotice("Network unstable, retrying via relay...");
          } else {
            setCallNotice("Network unstable, retrying call connection...");
          }
          void createQuickCallOfferTo(peerUserId, true);
          return;
        }
        endCall("connection-closed");
      }
    };
    peerConnectionRef.current = peerConnection;
    return peerConnection;
  };

  const ensureLocalAudio = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedInputDeviceId
          ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: selectedInputDeviceId } }
          : AUDIO_CONSTRAINTS,
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (error: any) {
      if (error?.name === "NotAllowedError") {
        setCallNotice(
          "Microphone permission denied. Enable mic access in browser site settings.",
        );
        return null;
      }
      throw error;
    }
  };

  const cleanupMedia = () => {
    if (quickCallDisconnectTimeoutRef.current) {
      window.clearTimeout(quickCallDisconnectTimeoutRef.current);
      quickCallDisconnectTimeoutRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setHasRemoteScreenShare(false);
    quickCallPendingIceRef.current = [];
    quickCallNeedsOfferRef.current = false;
    quickCallIceRestartAttemptedRef.current = false;
  };

  const flushQuickCallPendingIce = async (peerConnection: RTCPeerConnection) => {
    const queued = quickCallPendingIceRef.current;
    if (!queued.length || !peerConnection.remoteDescription) return;
    logQuickCallSignal("flush-pending-ice:start", { queuedCount: queued.length }, peerConnection);
    quickCallPendingIceRef.current = [];
    for (const candidate of queued) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        logQuickCallSignal("flush-pending-ice:added", undefined, peerConnection);
      } catch (error) {
        console.error("Failed to add queued quick-call ICE candidate:", error);
      }
    }
  };

  const endCall = (reason = "ended") => {
    const peerUserId = selectedUserId || incomingFromUserId || "";
    if (peerUserId && socketRef.current) {
      socketRef.current.emit("quick-call:end", { toUserId: peerUserId, reason });
    }
    cleanupMedia();
    void stopScreenShare();
    setIncomingFromUserId(null);
    setIncomingOffer(null);
    setCallStatus("idle");
    stopRingtone();
  };

  const startCall = async () => {
    if (!selectedUserId || !socketRef.current) return;
    try {
      setCallStatus("calling");
      const stream = await ensureLocalAudio();
      const peerConnection = getOrCreatePeerConnection(selectedUserId);
      if (stream) {
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });
      }
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      logQuickCallSignal("local-offer-created", { toUserId: selectedUserId }, peerConnection);
      socketRef.current.emit("quick-call:offer", { toUserId: selectedUserId, offer });
    } catch (error) {
      console.error("Failed to start quick call:", error);
      cleanupMedia();
      setCallStatus("idle");
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingFromUserId || !incomingOffer || !socketRef.current) return;
    try {
      setCallStatus("connecting");
      setSelectedUser(
        (prev) =>
          prev ||
          contacts.find((c) => resolveUserId(c) === incomingFromUserId) || {
            _id: incomingFromUserId,
            fullName: incomingFromName || "Teammate",
          },
      );
      const stream = await ensureLocalAudio();
      const peerConnection = getOrCreatePeerConnection(incomingFromUserId);
      if (stream) {
        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      logQuickCallSignal("incoming-offer-set-remote", { fromUserId: incomingFromUserId }, peerConnection);
      await flushQuickCallPendingIce(peerConnection);
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      logQuickCallSignal("incoming-answer-created", { toUserId: incomingFromUserId }, peerConnection);
      socketRef.current.emit("quick-call:answer", {
        toUserId: incomingFromUserId,
        answer,
      });
      setIncomingOffer(null);
      setIncomingFromUserId(null);
      stopRingtone();
    } catch (error) {
      console.error("Failed to accept quick call:", error);
      cleanupMedia();
      setIncomingOffer(null);
      setIncomingFromUserId(null);
      setCallStatus("idle");
      stopRingtone();
    }
  };

  const rejectIncomingCall = () => {
    if (incomingFromUserId && socketRef.current) {
      socketRef.current.emit("quick-call:end", {
        toUserId: incomingFromUserId,
        reason: "rejected",
      });
    }
    setIncomingOffer(null);
    setIncomingFromUserId(null);
    setCallStatus("idle");
    stopRingtone();
  };

  const isBusyForIncoming = () => callStatus !== "idle" || !!huddleRoomIdRef.current;

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (!saved) return;
    try {
      setMyUser(JSON.parse(saved));
    } catch (error) {
      console.error("Failed to parse local user for quick chat:", error);
    }
  }, []);

  useEffect(() => {
    if (!myUserId) return;
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("pm_token") ||
      localStorage.getItem("crm_token") ||
      "";

    const socket = io(process.env.NEXT_PUBLIC_HRMS_API_URL || API_HOST_URL, {
      auth: token
        ? {
            token,
            userName: resolveUserName(myUser),
          }
        : undefined,
      extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
      transports: ["polling", "websocket"],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      pushOpsIncident("info", "Websocket connected.");
      socket.emit("join-room", myUserId);
      socket.emit("huddle:rooms:list");
      if (isAdminLikeUser) {
        socket.emit("admin:quick-chat:presence:request");
      }
      if (autoRejoinRoomId) {
        void joinHuddle(autoRejoinRoomId);
      }
    });

    socket.on("disconnect", () => {
      pushOpsIncident("warn", "Websocket disconnected.");
      if (!huddleRoomIdRef.current) return;
      const droppedRoomId = huddleRoomIdRef.current;
      setLastHuddleRoomId(droppedRoomId);
      cleanupHuddle();
      setAutoRejoinRoomId(droppedRoomId);
      setAutoRejoinAttempt(0);
      setCallNotice(`Connection lost. Auto-rejoin started for "${droppedRoomId}".`);
    });

    socket.on(
      "quick-chat:online-users",
      (payload: { onlineUserIds: string[] }) => {
        const online = Array.isArray(payload?.onlineUserIds) ? payload.onlineUserIds : [];
        setQuickChatOnlineUserIds(online);
      },
    );

    socket.on("quick-chat:new-message", (incoming: QuickChatMessage) => {
      const incomingPeerId =
        incoming.fromUserId === myUserId ? incoming.toUserId : incoming.fromUserId;
      const isIncomingForMe = incoming.toUserId === myUserId;
      const activeSelectedUserId = selectedUserIdRef.current;
      const isCurrentConversationOpen =
        !!activeSelectedUserId && incomingPeerId === activeSelectedUserId;

      if (isIncomingForMe) {
        if (!isDndEnabled) {
          playNotificationSound("default", {
            volumeMultiplier: Math.max(MESSAGE_ALERT_VOLUME_MULTIPLIER, ringtoneVolume),
          });
        }
      }

      if (isCurrentConversationOpen) {
        setMessages((prev) => [...prev, incoming]);
        if (isIncomingForMe) {
          api.patch(`/quick-chat/messages/${activeSelectedUserId}/read`).catch(() => undefined);
          socket.emit("quick-chat:mark-read", { peerUserId: activeSelectedUserId });
        }
      } else if (isIncomingForMe) {
        if (!isDndEnabled) startUnreadMessageAlert();
        const fromName = getUserNameById(incoming.fromUserId);
        const preview = incoming.text?.trim() || "sent you a message";
        if (!isDndEnabled) {
          toast.info(`New message from ${fromName}`, {
            description: preview.length > 120 ? `${preview.slice(0, 120)}...` : preview,
          });
        }

        if (!isDndEnabled && "Notification" in window && Notification.permission === "granted") {
          new Notification(`New message from ${fromName}`, {
            body: preview,
          });
        }
      }
      loadConversations();
    });

    socket.on(
      "quick-chat:history:response",
      (payload: { peerUserId: string; messages: QuickChatMessage[] }) => {
        if (payload.peerUserId !== selectedUserIdRef.current) return;
        setMessages(payload.messages || []);
      },
    );

    socket.on("quick-chat:typing", (payload: { fromUserId: string; at: string }) => {
      if (!payload?.fromUserId || !payload?.at) return;
      setTypingByUser((prev) => ({ ...prev, [payload.fromUserId]: payload.at }));
    });

    socket.on(
      "quick-chat:messages-read",
      (payload: {
        peerUserId: string;
        readerUserId: string;
        readAt: string;
      }) => {
        if (!payload?.peerUserId || !payload?.readerUserId) return;
        if (payload.readerUserId === myUserId) return;
        setConversations((prev) =>
          prev.map((row) => {
            const peerId = resolveUserId(row.peerUser);
            if (peerId !== payload.readerUserId) return row;
            return {
              ...row,
              peerLastSeenAt: payload.readAt || new Date().toISOString(),
            };
          }),
        );
        if (selectedUserIdRef.current === payload.readerUserId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.fromUserId === myUserId
                ? {
                    ...m,
                    readBy: Array.from(new Set([...(m.readBy || []), payload.readerUserId])),
                  }
                : m,
            ),
          );
        }
      },
    );

    socket.on(
      "quick-call:offer",
      (payload: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
        if (!payload?.fromUserId || !payload?.offer) return;
        const activeSelectedUserId = selectedUserIdRef.current;
        if (peerConnectionRef.current && payload.fromUserId === activeSelectedUserId) {
          void (async () => {
            try {
              const pc = peerConnectionRef.current;
              if (!pc) return;
              if (payload.offer.type !== "offer") {
                console.warn("Ignoring non-offer payload on quick-call:offer");
                logQuickCallSignal(
                  "remote-offer-ignored:non-offer",
                  payload as unknown as Record<string, unknown>,
                  pc,
                );
                return;
              }
              if (pc.signalingState !== "stable") {
                console.warn(
                  "Ignoring quick-call offer in wrong signaling state:",
                  pc.signalingState,
                );
                logQuickCallSignal(
                  "remote-offer-ignored:wrong-state",
                  { fromUserId: payload.fromUserId, offerType: payload.offer.type },
                  pc,
                );
                return;
              }
              await pc.setRemoteDescription(new RTCSessionDescription(payload.offer));
              logQuickCallSignal("remote-offer-set", { fromUserId: payload.fromUserId }, pc);
              await flushQuickCallPendingIce(pc);
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              logQuickCallSignal("answer-created-for-remote-offer", { toUserId: payload.fromUserId }, pc);
              socket.emit("quick-call:answer", {
                toUserId: payload.fromUserId,
                answer,
              });
            } catch (error) {
              console.error("Failed to handle quick-call offer:", error);
            }
          })();
          return;
        }
        if (isBusyForIncoming()) {
          socket.emit("quick-call:busy", {
            toUserId: payload.fromUserId,
            reason: huddleRoomIdRef.current ? "in-huddle" : "already-in-call",
          });
          return;
        }
        setIncomingFromUserId(payload.fromUserId);
        setIncomingOffer(payload.offer);
        setCallStatus("incoming");
        setIsOpen(true);
        startRingtone();
      },
    );

    socket.on(
      "quick-call:answer",
      async (payload: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
        if (!payload?.fromUserId || !payload?.answer || !peerConnectionRef.current) return;
        if (payload.answer.type !== "answer") {
          console.warn("Ignoring non-answer payload on quick-call:answer");
          logQuickCallSignal("remote-answer-ignored:non-answer", payload as unknown as Record<string, unknown>);
          return;
        }
        if (peerConnectionRef.current.signalingState !== "have-local-offer") {
          console.warn(
            "Ignoring quick-call answer in wrong signaling state:",
            peerConnectionRef.current.signalingState,
          );
          logQuickCallSignal(
            "remote-answer-ignored:wrong-state",
            { fromUserId: payload.fromUserId, answerType: payload.answer.type },
            peerConnectionRef.current,
          );
          return;
        }
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
        logQuickCallSignal("remote-answer-set", { fromUserId: payload.fromUserId }, peerConnectionRef.current);
        await flushQuickCallPendingIce(peerConnectionRef.current);
        setCallStatus("connecting");
      },
    );

    socket.on(
      "quick-call:ice-candidate",
      async (payload: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
        if (!payload?.candidate || !peerConnectionRef.current) return;
        if (!peerConnectionRef.current.remoteDescription) {
          quickCallPendingIceRef.current.push(payload.candidate);
          logQuickCallSignal("remote-ice-queued", {
            fromUserId: payload.fromUserId,
            queuedCount: quickCallPendingIceRef.current.length,
          });
          return;
        }
        try {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(payload.candidate),
          );
          logQuickCallSignal("remote-ice-added", { fromUserId: payload.fromUserId }, peerConnectionRef.current);
        } catch (error) {
          console.error("Failed to add ICE candidate:", error);
        }
      },
    );

    socket.on("quick-call:end", () => {
      cleanupMedia();
      setIncomingFromUserId(null);
      setIncomingOffer(null);
      setCallStatus("idle");
      stopRingtone();
    });

    socket.on(
      "quick-call:busy",
      (payload: { fromUserId: string; reason?: string }) => {
        const reason = payload?.reason || "busy";
        setCallNotice(
          reason === "in-huddle"
            ? "User is in a huddle right now."
            : "User is busy on another call.",
        );
        setCallStatus("idle");
        cleanupMedia();
      },
    );

    socket.on(
      "huddle:rooms:list",
      (payload: { rooms: { roomId: string; participantCount: number }[] }) => {
        const rooms = Array.isArray(payload?.rooms) ? payload.rooms : [];
        setAvailableHuddleRooms(rooms.filter((r) => !!r.roomId));
      },
    );

    socket.on("admin:quick-chat:presence", (payload: AdminQuickChatPresence) => {
      if (!isAdminLikeUser) return;
      setAdminPresence({
        activeCalls: Array.isArray(payload?.activeCalls) ? payload.activeCalls : [],
        activeHuddles: Array.isArray(payload?.activeHuddles) ? payload.activeHuddles : [],
        generatedAt: payload?.generatedAt,
      });
    });

    socket.on(
      "huddle:joined",
      async (payload: {
        roomId: string;
        participants: string[];
        participantNames?: Record<string, string>;
      }) => {
        if (!payload?.roomId) return;
        cancelAutoRejoin();
        setHuddleJoinPendingRoomId(null);
        setHuddleRoomId(payload.roomId);
        setLastHuddleRoomId(payload.roomId);
        huddleRoomIdRef.current = payload.roomId;
        setHuddleParticipants(payload.participants || []);
        setHuddleParticipantNames(payload.participantNames || {});
        setHuddleParticipantStates((prev) => ({
          ...prev,
          [myUserId]: {
            muted: isHuddleMicMuted,
            speaking: false,
          },
        }));
        emitHuddleParticipantState({ muted: isHuddleMicMuted, speaking: false });
        const peers = (payload.participants || []).filter((id) => id !== myUserId);
        for (const peerId of peers) {
          await createHuddleOfferTo(peerId, payload.roomId);
        }
      },
    );

    socket.on(
      "huddle:participants-state",
      (payload: { roomId: string; states: Record<string, HuddleParticipantState> }) => {
        if (!payload?.roomId) return;
        setHuddleParticipantStates(payload.states || {});
      },
    );

    socket.on(
      "huddle:participant-state",
      (payload: { roomId: string; userId: string; muted: boolean; speaking: boolean }) => {
        if (!payload?.roomId || !payload?.userId) return;
        setHuddleParticipantStates((prev) => ({
          ...prev,
          [payload.userId]: {
            muted: !!payload.muted,
            speaking: !!payload.speaking,
          },
        }));
      },
    );

    socket.on(
      "huddle:user-joined",
      async (payload: {
        roomId: string;
        userId: string;
        participants: string[];
        participantNames?: Record<string, string>;
      }) => {
        if (!payload?.roomId) return;
        setHuddleParticipants(payload.participants || []);
        if (payload.participantNames) setHuddleParticipantNames(payload.participantNames);
        if (!huddleRoomIdRef.current || payload.roomId !== huddleRoomIdRef.current) return;
        if (payload.userId && payload.userId !== myUserId) {
          await createHuddleOfferTo(payload.userId, payload.roomId);
        }
      },
    );

    socket.on(
      "huddle:user-left",
      (payload: {
        roomId: string;
        userId: string;
        participants: string[];
        participantNames?: Record<string, string>;
      }) => {
        if (!payload?.roomId) return;
        setHuddleParticipants(payload.participants || []);
        if (payload.participantNames) setHuddleParticipantNames(payload.participantNames);
        const leftPeer = huddlePeerConnectionsRef.current.get(payload.userId);
        if (leftPeer) {
          leftPeer.close();
          huddlePeerConnectionsRef.current.delete(payload.userId);
        }
        huddleRemoteStreamsRef.current.delete(payload.userId);
        huddlePendingIceRef.current.delete(payload.userId);
        huddleAudioMetersRef.current.get(payload.userId)?.stop();
        huddleAudioMetersRef.current.delete(payload.userId);
        huddleSpeakingRef.current.delete(payload.userId);
        setHuddleParticipantStates((prev) => {
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        setHuddleConnectionStates((prev) => {
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        setHuddleJoinRequests((prev) =>
          prev.filter(
            (entry) =>
              !(entry.requesterUserId === payload.userId && entry.roomId === payload.roomId),
          ),
        );
      },
    );

    socket.on(
      "huddle:join-pending",
      (payload: { roomId: string; message?: string }) => {
        if (!payload?.roomId) return;
        setHuddleJoinPendingRoomId(payload.roomId);
        setIsQuickHuddlePanelOpen(true);
        setCallNotice(payload.message || `Join request sent for room "${payload.roomId}".`);
      },
    );
    socket.on(
      "huddle:join-blocked",
      (payload: { roomId: string; message?: string }) => {
        if (!payload?.roomId) return;
        setHuddleJoinPendingRoomId(null);
        setIsQuickHuddlePanelOpen(true);
        setCallNotice(
          payload.message || `You can join room "${payload.roomId}" only after an invite.`,
        );
      },
    );

    socket.on(
      "huddle:join-requested",
      (payload: {
        roomId: string;
        requesterUserId: string;
        requesterName?: string;
        requesterSocketId?: string;
        requesterIsGuest?: boolean;
      }) => {
        if (!payload?.roomId || !payload?.requesterUserId) return;
        if (payload.requesterUserId === myUserId) return;
        setIsQuickHuddlePanelOpen(true);
        setHuddleJoinRequests((prev) => {
          const exists = prev.some(
            (entry) =>
              entry.roomId === payload.roomId && entry.requesterUserId === payload.requesterUserId,
          );
          if (exists) return prev;
          return [...prev, payload];
        });
      },
    );

    socket.on(
      "huddle:join-request-response",
      (payload: { roomId: string; status: "accepted" | "rejected" }) => {
        if (!payload?.roomId || !payload?.status) return;
        if (payload.status === "accepted") {
          setCallNotice(`Join approved for room "${payload.roomId}". Joining now...`);
          void joinHuddle(payload.roomId);
        } else {
          setHuddleJoinPendingRoomId(null);
          setCallNotice(`Join request rejected for room "${payload.roomId}".`);
        }
      },
    );

    socket.on(
      "huddle:invite",
      (payload: { roomId: string; fromUserId: string }) => {
        if (!payload?.roomId || !payload?.fromUserId) return;
        if (isBusyForIncoming()) {
          socket.emit("huddle:invite-response", {
            roomId: payload.roomId,
            toUserId: payload.fromUserId,
            status: "busy",
          });
          return;
        }
        setHuddleInvite({ roomId: payload.roomId, fromUserId: payload.fromUserId });
        setIsOpen(true);
        startRingtone();
      },
    );

    socket.on(
      "huddle:invite-response",
      (payload: { fromUserId: string; status: "accepted" | "rejected" | "busy" }) => {
        if (!payload?.status) return;
        if (payload.status === "accepted") setCallNotice("Invite accepted.");
        else if (payload.status === "busy") setCallNotice("Invitee is busy right now.");
        else setCallNotice("Invite rejected.");
      },
    );

    socket.on(
      "huddle:signal",
      async (payload: {
        roomId: string;
        fromUserId: string;
        description?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      }) => {
        if (!payload?.roomId || !payload?.fromUserId) return;
        if (huddleRoomIdRef.current && payload.roomId !== huddleRoomIdRef.current) return;
        const fromId = payload.fromUserId;
        const peerConnection = await getHuddlePeerConnection(fromId);

        const flushPendingIce = async () => {
          const queued = huddlePendingIceRef.current.get(fromId);
          if (!queued?.length) return;
          huddlePendingIceRef.current.delete(fromId);
          for (const c of queued) {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(c));
            } catch (error) {
              console.error("Failed to add queued huddle ICE candidate:", error);
            }
          }
        };

        if (payload.description) {
          const isPolite = myUserId.localeCompare(fromId) > 0;
          const isOffer = payload.description.type === "offer";
          const isAnswer = payload.description.type === "answer";
          const offerCollision =
            isOffer &&
            ((huddleMakingOfferRef.current.get(fromId) ?? false) ||
              peerConnection.signalingState !== "stable");

          if (offerCollision && !isPolite) {
            console.warn(
              "Ignoring huddle offer collision for impolite peer:",
              fromId,
              peerConnection.signalingState,
            );
            return;
          }

          if (offerCollision && isPolite && peerConnection.signalingState === "have-local-offer") {
            try {
              await peerConnection.setLocalDescription({ type: "rollback" });
            } catch (error) {
              console.error("Failed to rollback huddle local offer:", error);
              return;
            }
          }

          if (isAnswer && peerConnection.signalingState !== "have-local-offer") {
            console.warn(
              "Ignoring huddle answer in wrong signaling state:",
              peerConnection.signalingState,
            );
            return;
          }

          await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.description));
          await flushPendingIce();
          if (isOffer) {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socketRef.current?.emit("huddle:signal", {
              roomId: payload.roomId,
              toUserId: fromId,
              description: answer,
            });
          }
        }
        if (payload.candidate) {
          if (!peerConnection.remoteDescription) {
            const q = huddlePendingIceRef.current.get(fromId) || [];
            q.push(payload.candidate);
            huddlePendingIceRef.current.set(fromId, q);
          } else {
            try {
              await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
            } catch (error) {
              console.error("Failed to add huddle ICE candidate:", error);
            }
          }
        }
      },
    );

    return () => {
      cleanupMedia();
      cleanupHuddle();
      void stopScreenShare();
      stopRingtone();
      stopUnreadMessageAlert();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [myUserId, isAdminLikeUser]);

  useEffect(() => {
    if (!isOpen) return;
    const loadContacts = async () => {
      try {
        const response = await api.get("/quick-chat/contacts");
        const users = Array.isArray(response.data) ? response.data : [];
        const filtered = users.filter((u: ChatUser) => resolveUserId(u) !== myUserId);
        setContacts(filtered);
      } catch (error) {
        console.error("Failed to load quick chat contacts:", error);
      }
    };
    loadContacts();
    loadConversations();
  }, [isOpen, myUserId]);

  useEffect(() => {
    if (!selectedUserId || !myUserId || !socketRef.current) return;
    socketRef.current.emit("quick-chat:history:request", {
      peerUserId: selectedUserId,
    });
    api.patch(`/quick-chat/messages/${selectedUserId}/read`).catch(() => undefined);
    socketRef.current.emit("quick-chat:mark-read", { peerUserId: selectedUserId });
    loadConversations();
  }, [selectedUserId, myUserId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!selectedPeerTypingAt) return;
    const timeout = window.setTimeout(() => {
      if (!selectedUserId) return;
      setTypingByUser((prev) => {
        const copy = { ...prev };
        delete copy[selectedUserId];
        return copy;
      });
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [selectedPeerTypingAt, selectedUserId]);

  const normalizedSearch = useMemo(
    () => deferredSearch.trim().toLowerCase(),
    [deferredSearch],
  );

  const filteredContacts = useMemo(
    () =>
      contacts.filter((contact) => {
        if (!normalizedSearch) return true;
        const name = resolveUserName(contact).toLowerCase();
        const email = (contact.email || "").toLowerCase();
        return name.includes(normalizedSearch) || email.includes(normalizedSearch);
      }),
    [contacts, normalizedSearch],
  );

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !selectedUserId || !myUserId || !socketRef.current) return;
    socketRef.current.emit("quick-chat:send", {
      toUserId: selectedUserId,
      text,
    });
    setDraft("");
  };

  const incomingFromName = useMemo(() => {
    if (!incomingFromUserId) return "";
    const fromContacts = contacts.find((contact) => resolveUserId(contact) === incomingFromUserId);
    if (fromContacts) return resolveUserName(fromContacts);
    const fromConversation = conversations.find(
      (conversation) => resolveUserId(conversation.peerUser) === incomingFromUserId,
    )?.peerUser;
    return resolveUserName(fromConversation || null);
  }, [incomingFromUserId, contacts, conversations]);

  const huddleInviteFromName = useMemo(() => {
    if (!huddleInvite?.fromUserId) return "";
    const fromContacts = contacts.find(
      (contact) => resolveUserId(contact) === huddleInvite.fromUserId,
    );
    if (fromContacts) return resolveUserName(fromContacts);
    const fromConversation = conversations.find(
      (conversation) => resolveUserId(conversation.peerUser) === huddleInvite.fromUserId,
    )?.peerUser;
    return resolveUserName(fromConversation || null);
  }, [huddleInvite, contacts, conversations]);

  const invitableContacts = contacts.filter((contact) => {
    const cid = resolveUserId(contact);
    return !!cid && !huddleParticipants.includes(cid);
  });

  const huddleParticipantRows = useMemo(() => {
    const rows = huddleParticipants.map((participantId) => {
      const state = huddleParticipantStates[participantId] || {
        muted: participantId === myUserId ? isHuddleMicMuted : false,
        speaking: false,
      };
      const name = participantId === myUserId ? "You" : getUserNameById(participantId);
      return {
        id: participantId,
        name,
        initials: initialsFromName(name),
        muted: !!state.muted,
        speaking: !!state.speaking,
        isSelf: participantId === myUserId,
        connectionState:
          participantId === myUserId
            ? ("connected" as HuddleConnectionState)
            : (huddleConnectionStates[participantId] || "unknown"),
      };
    });
    // Keep list order stable (join order) and only use visual highlight for speaking.
    return rows;
  }, [huddleParticipants, huddleParticipantStates, myUserId, isHuddleMicMuted, huddleConnectionStates]);
  const huddleSpeakingCount = useMemo(
    () => huddleParticipantRows.filter((participant) => participant.speaking).length,
    [huddleParticipantRows],
  );
  const retryCooldownNow = useMemo(() => Date.now(), [retryCooldownTick]);
  const notInHuddleRows = useMemo(
    () =>
      contacts
        .filter((contact) => {
          const id = resolveUserId(contact);
          return !!id && !huddleParticipants.includes(id);
        })
        .slice(0, 8),
    [contacts, huddleParticipants],
  );
  const huddleRemoteScreensSet = useMemo(
    () => new Set(huddleRemoteScreens),
    [huddleRemoteScreens],
  );
  const externalMeetingRooms = useMemo(
    () =>
      virtualOfficeRooms.filter(
        (room) => room?.mode === "external" && !!normalizeMeetingLink(room.link || ""),
      ),
    [virtualOfficeRooms],
  );

  const toggleUserIdInList = (
    userId: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    setter((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const createAutoHuddleRoomId = (seedUserIds: string[]) => {
    const cleanIds = Array.from(new Set(seedUserIds.filter(Boolean))).sort();
    return `qh-${Date.now()}-${cleanIds.join("-").slice(0, 48)}`;
  };

  const joinHuddle = async (forcedRoomId?: string) => {
    const roomId = (forcedRoomId || "").trim();
    if (!roomId || !socketRef.current || isJoiningHuddle) return;
    setIsJoiningHuddle(true);
    try {
      await ensureHuddleLocalAudio();
      socketRef.current.emit("huddle:join", { roomId });
      if (forcedRoomId && huddleInvite?.fromUserId) {
        socketRef.current.emit("huddle:invite-response", {
          roomId,
          toUserId: huddleInvite.fromUserId,
          status: "accepted",
        });
      }
      setHuddleInvite(null);
      stopRingtone();
    } catch (error) {
      console.error("Failed to join huddle:", error);
      setCallNotice("Failed to join huddle. Check microphone permission and try again.");
    } finally {
      setIsJoiningHuddle(false);
    }
  };

  const startQuickHuddle = async () => {
    if (!socketRef.current || huddleRoomId) return;
    const seed = selectedUserId
      ? Array.from(new Set([...quickHuddleUserIds, selectedUserId]))
      : quickHuddleUserIds;
    if (!seed.length) {
      setCallNotice("Select at least one teammate for quick huddle.");
      return;
    }
    const roomId = createAutoHuddleRoomId([myUserId, ...seed]);
    await joinHuddle(roomId);
    seed.forEach((toUserId) => {
      socketRef.current?.emit("huddle:invite", {
        roomId,
        toUserId,
      });
    });
    setQuickHuddleUserIds([]);
    setCallNotice(`Quick huddle started. ${seed.length} invite${seed.length > 1 ? "s" : ""} sent.`);
  };

  const leaveHuddle = () => {
    cancelAutoRejoin();
    if (huddleRoomId && socketRef.current) {
      socketRef.current.emit("huddle:leave", { roomId: huddleRoomId });
    }
    if (huddleRoomId) setLastHuddleRoomId(huddleRoomId);
    cleanupHuddle();
    void stopScreenShare();
  };

  const toggleHuddleMute = () => {
    if (isTogglingHuddleMute || !huddleRoomId) return;
    setIsTogglingHuddleMute(true);
    const stream = huddleLocalStreamRef.current;
    if (!stream) {
      setCallNotice("Microphone stream is not ready yet.");
      setIsTogglingHuddleMute(false);
      return;
    }
    const nextMuted = !isHuddleMicMuted;
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    setIsHuddleMicMuted(nextMuted);
    setHuddleParticipantStates((prev) => ({
      ...prev,
      [myUserId]: {
        muted: nextMuted,
        speaking: nextMuted ? false : (prev[myUserId]?.speaking ?? false),
      },
    }));
    if (nextMuted) {
      setLocalHuddleSpeaking(false);
    }
    emitHuddleParticipantState({ muted: nextMuted, speaking: nextMuted ? false : undefined });
    setIsTogglingHuddleMute(false);
  };

  const requestJoinHuddleByRoomId = async (roomId: string) => {
    const nextRoomId = roomId.trim();
    if (huddleRoomId && huddleRoomId !== nextRoomId) {
      setCallNotice("Leave current huddle before joining another room.");
      return;
    }
    if (!nextRoomId) {
      setCallNotice("Room is unavailable.");
      return;
    }
    await joinHuddle(nextRoomId);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ roomId?: string }>;
      const roomId = String(custom?.detail?.roomId || '').trim();
      if (!roomId) return;
      setIsOpen(true);
      void requestJoinHuddleByRoomId(roomId);
    };
    window.addEventListener('quick-chat:join-huddle-room', handler as EventListener);
    return () => {
      window.removeEventListener('quick-chat:join-huddle-room', handler as EventListener);
    };
  }, [huddleRoomId, socketRef.current]);

  const respondToJoinRequest = (
    roomId: string,
    requesterUserId: string,
    requesterSocketId: string | undefined,
    status: "accepted" | "rejected",
  ) => {
    if (!socketRef.current) return;
    socketRef.current.emit("huddle:join-request-response", {
      roomId,
      requesterUserId,
      requesterSocketId,
      status,
    });
    setHuddleJoinRequests((prev) =>
      prev.filter(
        (entry) =>
          !(entry.roomId === roomId && entry.requesterUserId === requesterUserId),
      ),
    );
    setCallNotice(status === "accepted" ? "Join request approved." : "Join request rejected.");
  };

  const copyPublicHuddleLink = async () => {
    if (!huddleRoomId) return;
    const base = window.location.origin;
    const link = `${base}/huddle/join/${encodeURIComponent(huddleRoomId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCallNotice("Public huddle link copied.");
    } catch {
      setCallNotice(link);
    }
  };

  const inviteToHuddle = () => {
    if (!huddleRoomId || !huddleInviteUserIds.length || !socketRef.current) return;
    huddleInviteUserIds.forEach((toUserId) => {
      socketRef.current?.emit("huddle:invite", {
        roomId: huddleRoomId,
        toUserId,
      });
    });
    setCallNotice(
      `${huddleInviteUserIds.length} user${huddleInviteUserIds.length > 1 ? "s" : ""} invited to huddle.`,
    );
    setHuddleInviteUserIds([]);
  };

  useEffect(() => {
    if (!callNotice) return;
    const timer = window.setTimeout(() => setCallNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [callNotice]);

  useEffect(() => {
    if (!huddleRoomId) return;
    const timer = window.setInterval(() => {
      setRetryCooldownTick((prev) => prev + 1);
    }, 500);
    return () => window.clearInterval(timer);
  }, [huddleRoomId]);

  useEffect(() => {
    if (!huddleRoomId) return;
    let cancelled = false;
    const syncMeshPeers = async () => {
      const peers = huddleParticipants.filter((id) => !!id && id !== myUserId);
      for (const peerId of peers) {
        if (cancelled) return;
        const existing = huddlePeerConnectionsRef.current.get(peerId);
        if (
          existing &&
          (existing.connectionState === "connected" ||
            existing.connectionState === "connecting" ||
            existing.connectionState === "new")
        ) {
          continue;
        }
        try {
          if (existing) {
            existing.close();
            huddlePeerConnectionsRef.current.delete(peerId);
            huddleMakingOfferRef.current.delete(peerId);
            huddleNeedsOfferRef.current.delete(peerId);
          }
          await createHuddleOfferTo(peerId, huddleRoomId);
        } catch (error) {
          console.error("Huddle mesh peer sync failed:", error);
        }
      }
    };
    void syncMeshPeers();
    const interval = window.setInterval(() => {
      void syncMeshPeers();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [huddleRoomId, huddleParticipants, myUserId]);

  useEffect(() => {
    const stream = huddleLocalStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !isHuddleMicMuted;
    });
  }, [isHuddleMicMuted]);

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conversation) => {
        if (!normalizedSearch) return true;
        const peerName = resolveUserName(conversation.peerUser).toLowerCase();
        const peerEmail = (conversation.peerUser?.email || "").toLowerCase();
        return (
          peerName.includes(normalizedSearch) || peerEmail.includes(normalizedSearch)
        );
      }),
    [conversations, normalizedSearch],
  );

  const filteredConversationPeerIds = useMemo(
    () =>
      new Set(
        filteredConversations
          .map((conversation) => resolveUserId(conversation.peerUser))
          .filter(Boolean),
      ),
    [filteredConversations],
  );

  const discoverableContacts = useMemo(
    () =>
      filteredContacts
        .filter((contact) => !filteredConversationPeerIds.has(resolveUserId(contact)))
        .slice(0, visibleDiscoveryContactCount),
    [filteredContacts, filteredConversationPeerIds, visibleDiscoveryContactCount],
  );
  const totalDiscoverableContactCount = useMemo(
    () =>
      filteredContacts.filter(
        (contact) => !filteredConversationPeerIds.has(resolveUserId(contact)),
      ).length,
    [filteredContacts, filteredConversationPeerIds],
  );
  const renderedConversations = useMemo(
    () => filteredConversations.slice(0, visibleConversationCount),
    [filteredConversations, visibleConversationCount],
  );

  const renderedMessages = useMemo(
    () => messages.slice(-MAX_RENDERED_MESSAGES),
    [messages],
  );
  const latestOutgoingMessageId = useMemo(() => {
    for (let i = renderedMessages.length - 1; i >= 0; i -= 1) {
      if (renderedMessages[i]?.fromUserId === myUserId) return renderedMessages[i].id;
    }
    return "";
  }, [renderedMessages, myUserId]);

  const totalUnreadCount = conversations.reduce(
    (sum, conversation) => sum + Number(conversation.unreadCount || 0),
    0,
  );

  useEffect(() => {
    if (totalUnreadCount <= 0) {
      stopUnreadMessageAlert();
    }
  }, [totalUnreadCount]);

  useEffect(() => {
    if (!isAdminLikeUser && leftPanelTab === "presence") {
      setLeftPanelTab("chats");
    }
  }, [isAdminLikeUser, leftPanelTab]);

  useEffect(() => {
    const saved = localStorage.getItem("quick-chat-ringtone-volume");
    if (!saved) return;
    const parsed = Number(saved);
    if (!Number.isNaN(parsed)) {
      setRingtoneVolume(Math.max(0.4, Math.min(2.5, parsed)));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("quick-chat-ringtone-volume", String(ringtoneVolume));
  }, [ringtoneVolume]);

  useEffect(() => {
    const saved = localStorage.getItem("quick-chat-low-end-mode");
    if (!saved) return;
    setLowEndModeEnabled(saved === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("quick-chat-low-end-mode", String(lowEndModeEnabled));
  }, [lowEndModeEnabled]);

  useEffect(() => {
    refreshScreenShareDiagnostics();
  }, [isScreenSharing, callStatus, selectedUserId, huddleRoomId, huddleParticipants.length]);

  useEffect(() => {
    if (!autoRejoinRoomId || huddleRoomId) return;
    if (!socketRef.current?.connected) return;
    if (autoRejoinAttempt >= 5) {
      setCallNotice(`Auto-rejoin failed for "${autoRejoinRoomId}". Use Rejoin button.`);
      cancelAutoRejoin();
      return;
    }
    clearAutoRejoinTimer();
    const delays = [1500, 3000, 5000, 8000, 12000];
    const waitMs = delays[Math.min(autoRejoinAttempt, delays.length - 1)];
    autoRejoinTimeoutRef.current = window.setTimeout(() => {
      setCallNotice(
        `Rejoin attempt ${autoRejoinAttempt + 1}/5 for "${autoRejoinRoomId}"...`,
      );
      void joinHuddle(autoRejoinRoomId);
      setAutoRejoinAttempt((prev) => prev + 1);
    }, waitMs);
    return () => clearAutoRejoinTimer();
  }, [autoRejoinRoomId, autoRejoinAttempt, huddleRoomId, socketRef.current?.connected]);

  useEffect(() => {
    if (
      callStatus === "idle" &&
      !huddleRoomId &&
      !peerConnectionRef.current &&
      huddlePeerConnectionsRef.current.size === 0
    ) {
      setConnectionQuality({ label: "Unknown", rttMs: null });
      return;
    }
    void evaluateConnectionQuality();
    const interval = window.setInterval(() => {
      void evaluateConnectionQuality();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [callStatus, huddleRoomId, huddleParticipants.length]);

  useEffect(() => {
    return () => {
      cancelAutoRejoin();
      stopScreenShareTest();
      if (deviceMicMonitorRafRef.current) {
        window.cancelAnimationFrame(deviceMicMonitorRafRef.current);
      }
      if (deviceMicMonitorStreamRef.current) {
        deviceMicMonitorStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (deviceMicMonitorContextRef.current) {
        void deviceMicMonitorContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const readPermission = async () => {
      try {
        const permissionsApi = (navigator as any)?.permissions;
        setSupportsPermissionsApi(!!permissionsApi?.query);
        if (!permissionsApi?.query) {
          setScreenShareDiagnostics((prev) => ({
            ...prev,
            permissionState: "unknown",
          }));
          return;
        }
        const result = await permissionsApi.query({ name: "display-capture" as PermissionName });
        setScreenShareDiagnostics((prev) => ({
          ...prev,
          permissionState: (result?.state as ScreenShareDiagnostics["permissionState"]) || "unknown",
        }));
      } catch {
        setSupportsPermissionsApi(false);
        setScreenShareDiagnostics((prev) => ({
          ...prev,
          permissionState: "unknown",
        }));
      }
    };
    void readPermission();
  }, []);

  useEffect(() => {
    void listAudioDevices();
    const handler = () => {
      void listAudioDevices();
    };
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void startMicLevelMonitor();
  }, [isOpen, selectedInputDeviceId]);

  useEffect(() => {
    if (!isOpen || leftPanelTab !== "chats") return;
    void loadVirtualOfficeRooms();
  }, [isOpen, leftPanelTab]);

  useEffect(() => {
    void applyOutputDevice();
  }, [selectedOutputDeviceId, huddleParticipants.length, hasRemoteScreenShare]);

  useEffect(() => {
    setVisibleConversationCount(INITIAL_VISIBLE_CONVERSATIONS);
  }, [normalizedSearch]);

  useEffect(() => {
    setVisibleDiscoveryContactCount(INITIAL_VISIBLE_DISCOVERY_CONTACTS);
  }, [normalizedSearch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("quickChatSettingsOpen");
    if (saved !== null) setIsQuickChatSettingsOpen(saved === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("quickChatSettingsOpen", String(isQuickChatSettingsOpen));
  }, [isQuickChatSettingsOpen]);

  useEffect(() => {
    const updateViewport = () => setIsDesktopViewport(window.innerWidth >= 768);
    const updateSidebarState = () => {
      const pinned = localStorage.getItem("suiteSidebarPinned");
      if (pinned === "true") {
        setIsSuiteSidebarCollapsed(false);
        return;
      }
      const saved = localStorage.getItem("suiteSidebarCollapsed");
      setIsSuiteSidebarCollapsed(saved === null ? true : saved === "true");
    };
    const onSidebarState = (event: Event) => {
      const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail;
      if (typeof detail?.collapsed === "boolean") {
        setIsSuiteSidebarCollapsed(detail.collapsed);
        return;
      }
      updateSidebarState();
    };

    updateViewport();
    updateSidebarState();

    window.addEventListener("resize", updateViewport);
    window.addEventListener("storage", updateSidebarState);
    window.addEventListener("suite-sidebar:state", onSidebarState);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("storage", updateSidebarState);
      window.removeEventListener("suite-sidebar:state", onSidebarState);
    };
  }, []);

  const expandedPanelStyle = useMemo<CSSProperties | undefined>(() => {
    if (!isWorkspaceMode) return undefined;
    if (!isDesktopViewport) {
      return { top: "4.5rem", right: "0.75rem", bottom: "0.75rem", left: "0.75rem" };
    }
    const sidebarWidth = isSuiteSidebarCollapsed ? 80 : 256;
    return {
      top: "4.5rem",
      right: "1rem",
      bottom: "1rem",
      left: `${sidebarWidth + 16}px`,
    };
  }, [isWorkspaceMode, isDesktopViewport, isSuiteSidebarCollapsed]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-[var(--hs-link)] text-white shadow-xl ring-4 ring-white/80 transition hover:scale-[1.03] hover:opacity-95 active:scale-[0.98]"
        aria-label="Toggle quick chat"
      >
        {isOpen ? <X className="mx-auto h-6 w-6" /> : <MessageCircle className="mx-auto h-6 w-6" />}
        {totalUnreadCount > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-red-600 px-1 py-0.5 text-center text-xs font-semibold leading-none text-white shadow">
            {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`fixed z-50 rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex min-h-0 flex-col ${
            isWorkspaceMode
              ? "inset-auto"
              : "inset-x-3 bottom-24 h-[min(78vh,620px)] w-auto sm:inset-x-auto sm:right-6 sm:w-[min(760px,calc(100vw-3rem))] sm:flex-row"
          } ${isWorkspaceMode && isDesktopViewport ? "md:flex-row" : ""}`}
          style={expandedPanelStyle}
        >
          <div
            className={`w-full min-h-0 border-slate-200 flex flex-col bg-slate-50/50 ${
              isWorkspaceMode
                ? isDesktopViewport
                  ? "md:w-[34%] md:min-w-[300px] md:border-r"
                  : "border-b"
                : "sm:w-[40%] sm:min-w-[260px] border-b sm:border-b-0 sm:border-r"
            }`}
          >
            <div className="p-4 border-b border-slate-200 bg-white">
              <p className="text-sm font-semibold text-slate-800 mb-3">Quick Chat</p>
              {isAdminLikeUser && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab("chats")}
                    className={`h-7 flex-1 rounded-md text-xs font-semibold transition ${
                      leftPanelTab === "chats"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Chats
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeftPanelTab("presence")}
                    className={`h-7 flex-1 rounded-md text-xs font-semibold transition ${
                      leftPanelTab === "presence"
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    Admin Presence
                  </button>
                </div>
              )}
              {leftPanelTab === "chats" && (
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
              {leftPanelTab === "presence" && isAdminLikeUser ? (
                <div className="p-3 space-y-3">
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-900">
                      Live Call Presence (Admin)
                    </p>
                    <p className="mt-1 text-xs text-indigo-700/80">
                      Monitor active calls/huddles without covering chat.
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-indigo-800">
                      Active 1:1 calls ({adminPresence.activeCalls.length})
                    </p>
                    {adminPresence.activeCalls.length === 0 ? (
                      <p className="mt-1 text-xs text-indigo-700/80">No active 1:1 calls.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {adminPresence.activeCalls.map((entry) => (
                          <p key={`admin-call-${entry.users.join("-")}`} className="text-xs text-indigo-700">
                            {getUserNameById(entry.users[0] || "")} <span className="text-indigo-500">↔</span>{" "}
                            {getUserNameById(entry.users[1] || "")}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-indigo-800">
                      Active huddles ({adminPresence.activeHuddles.length})
                    </p>
                    {adminPresence.activeHuddles.length === 0 ? (
                      <p className="mt-1 text-xs text-indigo-700/80">No active huddles.</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {adminPresence.activeHuddles.map((room) => (
                          <p key={`admin-huddle-${room.roomId}`} className="text-xs text-indigo-700">
                            {room.roomId}:{" "}
                            {(room.participants || []).map((id) => getUserNameById(id)).join(", ") ||
                              "No participants"}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-indigo-800">Ops health (SLA)</p>
                    <p className="mt-1 text-xs text-indigo-700/90">
                      Websocket: {socketRef.current?.connected ? "connected" : "disconnected"} | TURN configured: {HAS_TURN_CONFIGURED ? "yes" : "no"} | ICE servers: {RTC_ICE_SERVERS.length}
                    </p>
                    <p className="mt-1 text-xs text-indigo-700/90">
                      Connection: {connectionQuality.label}
                      {connectionQuality.rttMs !== null ? ` (${connectionQuality.rttMs}ms RTT)` : ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold text-indigo-800">Incident panel</p>
                    {opsIncidents.length === 0 ? (
                      <p className="mt-1 text-xs text-indigo-700/80">No incidents logged yet.</p>
                    ) : (
                      <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                        {opsIncidents.map((incident, index) => (
                          <p key={`ops-incident-${index}`} className="text-xs text-indigo-700">
                            [{new Date(incident.at).toLocaleTimeString()}] {incident.level.toUpperCase()} - {incident.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
              {renderedConversations.map((conversation) => {
                const peer = conversation.peerUser;
                const id = resolveUserId(peer);
                const isSelected = !!id && id === selectedUserId;
                const peerOnline = isUserOnline(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedUser(peer)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-200/80 transition hover:bg-slate-100/70 ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 inline-flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${peerOnline ? "bg-emerald-500" : "bg-slate-300"}`}
                          title={peerOnline ? "Online" : "Offline"}
                        />
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {resolveUserName(peer)}
                        </p>
                      </div>
                      {conversation.unreadCount > 0 && (
                        <span className="rounded-full bg-[var(--hs-link)] px-2 py-0.5 text-xs font-semibold text-white">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-1">
                      {conversation.lastMessage?.text || "No messages yet"}
                    </p>
                  </button>
                );
              })}

              {filteredConversations.length === 0 && (
                <div className="p-4 text-xs text-slate-500">No conversations yet.</div>
              )}
              {renderedConversations.length < filteredConversations.length && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleConversationCount((prev) => prev + LIST_INCREMENT)
                  }
                  className="w-full border-b border-slate-200/80 px-4 py-2 text-left text-xs font-semibold text-blue-600 transition hover:bg-slate-100/70"
                >
                  Load more conversations
                </button>
              )}

              {discoverableContacts.map((contact) => (
                  <button
                    key={`new-${resolveUserId(contact)}`}
                    type="button"
                    onClick={() => setSelectedUser(contact)}
                    className="w-full text-left px-4 py-3 border-b border-slate-200/80 transition hover:bg-slate-100/70"
                  >
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {resolveUserName(contact)}
                    </p>
                    <p className="text-xs text-slate-500 truncate mt-1">{contact.email || "No email"}</p>
                  </button>
                ))}
              {discoverableContacts.length < totalDiscoverableContactCount && (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleDiscoveryContactCount((prev) => prev + LIST_INCREMENT)
                  }
                  className="w-full border-b border-slate-200/80 px-4 py-2 text-left text-xs font-semibold text-blue-600 transition hover:bg-slate-100/70"
                >
                  Load more contacts
                </button>
              )}
                </>
              )}
            </div>
            {!huddleRoomId && leftPanelTab === "chats" && (
              <div className="max-h-[42%] overflow-y-auto border-t border-slate-200 bg-white p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setIsQuickHuddlePanelOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left"
                  aria-label="Toggle meet and huddle section"
                  title="Open Meet & Huddle controls"
                >
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Meet & Huddle
                  </p>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsQuickChatSettingsOpen((prev) => !prev);
                      }}
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 text-slate-600 hover:bg-slate-100"
                      aria-label="Quick chat settings"
                      title="Open quick chat settings"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">Settings</span>
                    </button>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-500 transition-transform ${
                        isQuickHuddlePanelOpen ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>
                {isQuickHuddlePanelOpen && (
                  <>
                    <p className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <Users className="h-3 w-3" />
                      Huddles
                    </p>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                          Select teammates
                        </p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          {quickHuddleUserIds.length} selected
                        </span>
                      </div>
                      <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60">
                      {contacts.slice(0, 8).map((contact) => {
                        const cid = resolveUserId(contact);
                        if (!cid) return null;
                        const checked = quickHuddleUserIds.includes(cid);
                        return (
                          <label
                            key={`sidebar-quick-huddle-${cid}`}
                            className={`flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2.5 py-2 last:border-0 hover:bg-white ${
                              checked ? "bg-blue-50/60" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUserIdInList(cid, setQuickHuddleUserIds)}
                              className="h-3.5 w-3.5 rounded border-slate-300"
                            />
                            <span className="truncate text-xs text-slate-700">{resolveUserName(contact)}</span>
                          </label>
                        );
                      })}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void startQuickHuddle();
                      }}
                      disabled={!quickHuddleUserIds.length && !selectedUserId}
                      title="Start a huddle with selected people"
                      className="h-8 w-full rounded-lg bg-[var(--hs-link)] text-xs font-semibold text-white transition hover:bg-[#ff6a45] disabled:pointer-events-none disabled:opacity-40"
                    >
                      Start Huddle
                    </button>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                        Active Rooms
                      </p>
                      <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                        {availableHuddleRooms.length === 0 && (
                          <p className="text-xs text-slate-500">No active rooms right now.</p>
                        )}
                        {availableHuddleRooms.map((room) => (
                          <div
                            key={`room-list-${room.roomId}`}
                            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-2 hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-slate-700">{room.roomId}</p>
                              <p className="text-xs text-slate-500">{room.participantCount} in room</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                void requestJoinHuddleByRoomId(room.roomId);
                              }}
                              disabled={isJoiningHuddle}
                              title="Join this active huddle room"
                              className="h-7 rounded-full bg-blue-600 px-3 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isJoiningHuddle ? "Joining..." : "Join"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2">
                      <p className="mb-1.5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <Video className="h-3 w-3" />
                        Meetings
                      </p>
                      <div className="max-h-28 space-y-1 overflow-y-auto pr-1">
                        {isVirtualOfficeLoading ? (
                          <p className="text-xs text-slate-500">Loading meetings...</p>
                        ) : externalMeetingRooms.length === 0 ? (
                          <p className="text-xs text-slate-500">No external meetings configured.</p>
                        ) : (
                          externalMeetingRooms.map((room, idx) => {
                            const link = normalizeMeetingLink(room.link || "");
                            return (
                              <div
                                key={`meeting-link-${room.name}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-2 py-2 hover:bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-semibold text-slate-700">{room.name}</p>
                                  <p className="text-xs text-slate-500">{room.provider || "External meeting"}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    window.open(link, "_blank", "noopener,noreferrer");
                                  }}
                                  className="h-7 rounded-full bg-[#0c66e4] px-3 text-xs font-semibold text-white transition hover:bg-[#0a57c0]"
                                >
                                  Join
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    {huddleJoinPendingRoomId && (
                      <p className="text-xs text-amber-700 truncate">
                        Pending: {huddleJoinPendingRoomId}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center bg-white">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {selectedUser ? resolveUserName(selectedUser) : "Select a user"}
                </p>
                {selectedUser && (
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {isPeerTyping
                      ? "Typing..."
                      : (() => {
                          const row = conversations.find(
                            (conversation) =>
                              resolveUserId(conversation.peerUser) === selectedUserId,
                          );
                          if (isUserOnline(selectedUserId)) return "Online";
                          return row?.peerLastSeenAt
                            ? `Last seen ${new Date(row.peerLastSeenAt).toLocaleString()}`
                            : "Offline";
                        })()}
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">Status: {availabilityStatus}</p>
                <p className="text-xs text-slate-400">
                  Calendar: not connected
                  {huddleRoomId || callStatus === "in-call" || callStatus === "connecting"
                    ? " - conflict hint: active call/huddle in progress"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDndEnabled((prev) => !prev)}
                  className={`h-8 rounded-lg px-2 text-xs font-semibold border ${
                    isDndEnabled
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                  title={isDndEnabled ? "Disable DND" : "Enable DND"}
                >
                  {isDndEnabled ? "DND ON" : "DND OFF"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pinned = localStorage.getItem("suiteSidebarPinned") === "true";
                    const saved = localStorage.getItem("suiteSidebarCollapsed");
                    setIsSuiteSidebarCollapsed(
                      pinned ? false : saved === null ? true : saved === "true",
                    );
                    setIsWorkspaceMode((prev) => !prev);
                  }}
                  className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100"
                  aria-label={isWorkspaceMode ? "Exit expanded chat view" : "Expand chat view"}
                  title={isWorkspaceMode ? "Exit expanded view" : "Open expanded view"}
                >
                  {isWorkspaceMode ? (
                    <Minimize2 className="mx-auto h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="mx-auto h-3.5 w-3.5" />
                  )}
                </button>
                {selectedUser && (
                  <>
                  {(callStatus === "idle" || callStatus === "calling") && (
                    <button
                      type="button"
                      onClick={callStatus === "idle" ? startCall : () => endCall("cancelled")}
                      className={`h-8 w-8 rounded-lg text-white shadow-sm transition hover:brightness-95 ${
                        callStatus === "idle" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                      aria-label={callStatus === "idle" ? "Start call" : "Cancel call"}
                    >
                      <Phone className="mx-auto h-3.5 w-3.5" />
                    </button>
                  )}
                  {(callStatus === "connecting" || callStatus === "in-call") && (
                    <button
                      type="button"
                      onClick={() => endCall("ended")}
                      className="h-8 w-8 rounded-lg bg-red-500 text-white shadow-sm transition hover:bg-red-600"
                      aria-label="End call"
                    >
                      <PhoneOff className="mx-auto h-3.5 w-3.5" />
                    </button>
                  )}
                  </>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-b border-slate-200 bg-[#202124] text-white">
              {huddleRoomId ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      Huddle: {huddleRoomId}
                    </p>
                    <p className="text-xs text-white/70 truncate">
                      {huddleParticipants.length} participants
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void copyPublicHuddleLink();
                    }}
                    className="h-8 px-3 rounded-full border border-white/25 bg-white/10 text-white text-xs transition hover:bg-white/20"
                  >
                    Copy Public Link
                  </button>
                  <button
                    type="button"
                    onClick={leaveHuddle}
                    disabled={isJoiningHuddle}
                    className="h-8 px-4 rounded-full bg-[#ea4335] text-white text-xs font-semibold transition hover:bg-[#d63f32] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Leave
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-white/70">Use left panel Quick Huddle controls to start or join rooms.</p>
                  {lastHuddleRoomId ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          cancelAutoRejoin();
                          void requestJoinHuddleByRoomId(lastHuddleRoomId);
                        }}
                        disabled={isJoiningHuddle}
                        className="h-8 rounded-full bg-[#0b57d0] px-3 text-xs font-medium text-white transition hover:bg-[#0a4bb4] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isJoiningHuddle ? "Joining..." : `Rejoin ${lastHuddleRoomId}`}
                      </button>
                      {autoRejoinRoomId ? (
                        <button
                          type="button"
                          onClick={cancelAutoRejoin}
                          className="h-8 rounded-full border border-white/25 bg-white/10 px-3 text-xs font-medium text-white transition hover:bg-white/20"
                        >
                          Cancel auto-rejoin
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {autoRejoinRoomId ? (
                    <p className="text-xs text-blue-200">
                      Auto-rejoin active: attempt {Math.min(autoRejoinAttempt, 5)}/5
                    </p>
                  ) : null}
                </div>
              )}
            </div>
            {huddleRoomId && (
              <div className="px-4 py-3 border-b border-slate-200 bg-[#1f1f1f] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/70">
                    Huddle members
                  </p>
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                    Live: {huddleSpeakingCount} speaking
                  </span>
                  <button
                    type="button"
                    onClick={toggleHuddleMute}
                    disabled={isTogglingHuddleMute || isJoiningHuddle}
                    className={`h-7 rounded-md px-2.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      isHuddleMicMuted ? "bg-red-500/40 hover:bg-red-500/55" : "bg-emerald-600 hover:bg-emerald-700"
                    }`}
                  >
                    {isHuddleMicMuted ? (
                      <span className="inline-flex items-center gap-1"><MicOff className="h-3.5 w-3.5" />Muted</span>
                    ) : (
                      <span className="inline-flex items-center gap-1"><Mic className="h-3.5 w-3.5" />Unmuted</span>
                    )}
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {huddleParticipantRows.map((participant) => (
                    <div
                      key={`huddle-participant-${participant.id}`}
                      className={`flex items-center justify-between rounded-full border px-2 py-1.5 ${
                        participant.speaking
                          ? "border-emerald-400 bg-emerald-50 shadow-[0_0_0_2px_rgba(16,185,129,0.22)]"
                          : "border-white/15 bg-white/5"
                      }`}
                    >
                      <div className="min-w-0 inline-flex items-center gap-2">
                        <div
                          className={`h-6 w-6 shrink-0 rounded-full border text-xs font-semibold inline-flex items-center justify-center ${
                            participant.speaking
                              ? "relative border-emerald-400 bg-emerald-100 text-emerald-700 shadow-[0_0_0_3px_rgba(16,185,129,0.22)]"
                              : "border-white/20 bg-white/10 text-white"
                          }`}
                        >
                          {participant.speaking ? (
                            <span className="pointer-events-none absolute inset-[-3px] rounded-full border border-emerald-300/80 animate-ping" />
                          ) : null}
                          {participant.initials}
                        </div>
                        <div className="min-w-0 flex items-center gap-1.5">
                          <p className="truncate text-xs font-medium text-white">{participant.name}</p>
                          {huddleRemoteScreensSet.has(participant.id) ? (
                            <span className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/20 px-1.5 py-0.5 text-xs font-semibold text-blue-200">
                              Screen sharing
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2 text-xs shrink-0">
                        {participant.connectionState === "connected" ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Connected
                          </span>
                        ) : participant.connectionState === "connecting" ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                            Connecting
                          </span>
                        ) : participant.connectionState === "reconnecting" ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                            Reconnecting
                          </span>
                        ) : participant.connectionState === "failed" ? (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-700">
                            Failed
                          </span>
                        ) : (
                          <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-xs font-semibold text-white/70">
                            Unknown
                          </span>
                        )}
                        {isAdminLikeUser &&
                        !participant.isSelf &&
                        (participant.connectionState === "reconnecting" ||
                          participant.connectionState === "failed") ? (
                          <button
                            type="button"
                            onClick={() => {
                              void retryHuddlePeerConnection(participant.id);
                            }}
                            disabled={
                              retryCooldownNow <
                              (huddleRetryCooldownRef.current.get(participant.id) || 0)
                            }
                            className="rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Retry
                          </button>
                        ) : null}
                        {participant.speaking ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Volume2 className="h-3.5 w-3.5" />
                            Speaking
                          </span>
                        ) : participant.muted ? (
                          <span className="inline-flex items-center gap-1 text-white/70">
                            <MicOff className="h-3.5 w-3.5" />
                            Muted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-blue-600">
                            <Volume2 className="h-3.5 w-3.5" />
                            Listening
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-1">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-white/60">
                    Not joined yet
                  </p>
                  {notInHuddleRows.length === 0 ? (
                    <p className="text-xs text-white/70">Everyone is in this huddle.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {notInHuddleRows.map((contact) => (
                        <span
                          key={`not-in-huddle-${resolveUserId(contact)}`}
                          className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-xs text-white/85"
                        >
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[9px] font-semibold text-white">
                            {initialsFromName(resolveUserName(contact))}
                          </span>
                          <span className="max-w-[110px] truncate">{resolveUserName(contact)}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!!huddleJoinRequests.length && (
              <div className="px-4 py-3 border-b border-slate-200 bg-indigo-50 space-y-2">
                <p className="text-xs font-semibold text-indigo-900">
                  Join Requests {isAdminLikeUser ? "(Admin)" : "(Members)"}
                </p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {huddleJoinRequests.map((request) => (
                    <div
                      key={`join-req-${request.roomId}-${request.requesterUserId}`}
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-2"
                    >
                      <p className="text-xs text-slate-700 truncate">
                        {request.requesterName || "Teammate"} {request.requesterIsGuest ? "(Guest)" : ""} wants to join "{request.roomId}"
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            respondToJoinRequest(
                              request.roomId,
                              request.requesterUserId,
                              request.requesterSocketId,
                              "accepted",
                            )
                          }
                          className="h-7 px-2.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            respondToJoinRequest(
                              request.roomId,
                              request.requesterUserId,
                              request.requesterSocketId,
                              "rejected",
                            )
                          }
                          className="h-7 px-2.5 rounded-md bg-slate-500 text-white text-xs font-medium hover:bg-slate-600"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {huddleRoomId && (
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 space-y-2">
                <p className="text-xs text-slate-500">Invite more teammates</p>
                <div className="max-h-24 overflow-y-auto rounded-lg border border-slate-300 bg-white p-1.5">
                  {invitableContacts.length === 0 && (
                    <p className="px-2 py-1 text-xs text-slate-400">No more users available to invite</p>
                  )}
                  {invitableContacts.map((contact) => {
                    const cid = resolveUserId(contact);
                    const checked = huddleInviteUserIds.includes(cid);
                    return (
                      <label
                        key={`invite-${cid}`}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleUserIdInList(cid, setHuddleInviteUserIds)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="text-xs text-slate-700 truncate">{resolveUserName(contact)}</span>
                      </label>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={inviteToHuddle}
                  disabled={!huddleInviteUserIds.length}
                  className="h-8 px-3 rounded-lg bg-blue-600 text-white text-xs shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                >
                  Invite Selected
                </button>
              </div>
            )}
            {callStatus !== "idle" && (
              <div className="px-4 py-2 border-b border-slate-200 text-xs text-slate-500 bg-slate-50">
                {callStatus === "calling" && "Calling..."}
                {callStatus === "incoming" && `Incoming call from ${incomingFromName || "user"}...`}
                {callStatus === "connecting" && "Connecting call..."}
                {callStatus === "in-call" && "In call"}
              </div>
            )}
            {(callStatus === "in-call" || callStatus === "connecting" || !!huddleRoomId) && (
              <div className="px-4 py-3 border-b border-slate-200 bg-[#1f1f1f] flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isScreenSharing) {
                      void stopScreenShare();
                    } else {
                      void startScreenShare();
                    }
                  }}
                  disabled={isScreenShareBusy}
                  className={`h-9 px-4 rounded-full text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isScreenSharing ? "bg-amber-500" : "bg-[#0b57d0]"
                  }`}
                >
                  {isScreenSharing ? (
                    <>
                      <MonitorOff className="h-3.5 w-3.5" />
                      Stop Share
                    </>
                  ) : (
                    <>
                      <MonitorUp className="h-3.5 w-3.5" />
                      Share Screen
                    </>
                  )}
                </button>
                {isScreenSharing && (
                  <span className="text-xs text-white/70 truncate">You are sharing your screen</span>
                )}
              </div>
            )}
            {(callStatus === "in-call" || callStatus === "connecting" || !!huddleRoomId || !!screenShareDiagnostics.lastError) && (
              <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/70">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-600">Screen share diagnostics</p>
                  <div className="inline-flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        void runScreenSharePreflightTest();
                      }}
                      className="rounded border border-blue-300 px-1.5 py-0.5 text-xs text-blue-700 hover:bg-blue-50"
                    >
                      Run test
                    </button>
                    <button
                      type="button"
                      onClick={() => refreshScreenShareDiagnostics()}
                      className="rounded border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Supported: {screenShareDiagnostics.supported ? "yes" : "no"} | Permission: {screenShareDiagnostics.permissionState}
                  {supportsPermissionsApi ? "" : " (permissions API unavailable)"} | Stream: {screenShareDiagnostics.streamActive ? "active" : "inactive"} | Track: {screenShareDiagnostics.videoTrackReadyState} | Peers: {screenShareDiagnostics.peersReceivingEstimate}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Connection quality: {connectionQuality.label}
                  {connectionQuality.rttMs !== null ? ` (${connectionQuality.rttMs}ms RTT)` : ""}
                </p>
                {!isDisplayCaptureSupported ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Display capture is not supported in this browser. Use latest Chrome/Edge for full huddle screen-share.
                  </p>
                ) : null}
                {screenShareDiagnostics.lastError ? (
                  <p className="mt-1 text-xs text-amber-700">{screenShareDiagnostics.lastError}</p>
                ) : null}
                {isScreenShareTestRunning ? (
                  <p className="mt-1 text-xs text-emerald-700">Preflight running: local-only preview active.</p>
                ) : null}
              </div>
            )}
            {!!callNotice && (
              <div className="px-4 py-2 border-b border-slate-200 text-xs text-amber-700 bg-amber-50">
                {callNotice}
              </div>
            )}
            {isScreenSharing && (
              <div className="px-3 py-2 border-b border-[var(--surface-dim)] bg-black/95">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-white/80">Your shared screen</p>
                  <button
                    type="button"
                    onClick={() => openVideoFullscreen(localScreenPreviewRef.current)}
                    className="rounded border border-white/20 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/10"
                  >
                    Full screen
                  </button>
                </div>
                <video
                  ref={localScreenPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-24 w-full rounded border border-white/10 bg-black object-cover"
                />
              </div>
            )}
            {hasRemoteScreenShare && (
              <div className="px-3 py-2 border-b border-[var(--surface-dim)] bg-black/95">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-white/80">Shared screen</p>
                  <button
                    type="button"
                    onClick={() => openVideoFullscreen(remoteVideoRef.current)}
                    className="rounded border border-white/20 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/10"
                  >
                    Full screen
                  </button>
                </div>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-28 w-full rounded border border-white/10 bg-black object-cover"
                />
              </div>
            )}
            {!!huddleRemoteScreens.length && (
              <div className="px-3 py-2 border-b border-[var(--surface-dim)] bg-black/95 space-y-2">
                <p className="text-xs text-white/80">Huddle shared screens</p>
                {huddleRemoteScreens.map((participantId) => (
                  <div key={`huddle-screen-wrap-${participantId}`}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-xs text-white/60 truncate">
                        {resolveUserName(
                          contacts.find((contact) => resolveUserId(contact) === participantId) || null,
                        )}
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          openVideoFullscreen(
                            huddleRemoteVideoRefs.current.get(participantId) || null,
                          )
                        }
                        className="rounded border border-white/20 px-1.5 py-0.5 text-xs text-white/80 hover:bg-white/10"
                      >
                        Full screen
                      </button>
                    </div>
                    <video
                      autoPlay
                      playsInline
                      className="h-24 w-full rounded border border-white/10 bg-black object-cover"
                      ref={(el) => {
                        if (!el) {
                          huddleRemoteVideoRefs.current.delete(participantId);
                          return;
                        }
                        huddleRemoteVideoRefs.current.set(participantId, el);
                        const existingStream = huddleRemoteStreamsRef.current.get(participantId);
                        if (existingStream && existingStream.getVideoTracks().length > 0) {
                          el.srcObject = existingStream;
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {callStatus === "incoming" && (
              <div className="px-4 py-3 border-b border-slate-200 bg-orange-50 flex items-center gap-2">
                <button
                  type="button"
                  onClick={acceptIncomingCall}
                  className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs transition hover:bg-emerald-600"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={rejectIncomingCall}
                  className="h-8 px-3 rounded-lg bg-red-500 text-white text-xs transition hover:bg-red-600"
                >
                  Reject
                </button>
              </div>
            )}
            {huddleInvite && !huddleRoomId && (
              <div className="px-4 py-3 border-b border-slate-200 bg-blue-50 flex items-center gap-2">
                <p className="text-xs text-blue-900 flex-1 truncate">
                  {`${huddleInviteFromName || "A teammate"} invited you to huddle "${huddleInvite.roomId}"`}
                </p>
                <button
                  type="button"
                  onClick={() => joinHuddle(huddleInvite.roomId)}
                  disabled={isJoiningHuddle}
                  className="h-8 px-3 rounded-lg bg-emerald-500 text-white text-xs transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isJoiningHuddle ? "Joining..." : "Join"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (huddleInvite?.fromUserId && socketRef.current) {
                      socketRef.current.emit("huddle:invite-response", {
                        roomId: huddleInvite.roomId,
                        toUserId: huddleInvite.fromUserId,
                        status: "rejected",
                      });
                    }
                    setHuddleInvite(null);
                    stopRingtone();
                  }}
                  className="h-8 px-3 rounded-lg bg-slate-500 text-white text-xs transition hover:bg-slate-600"
                >
                  Ignore
                </button>
              </div>
            )}

            <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain p-4 pb-8 space-y-2.5 bg-slate-50">
              {renderedMessages.map((message) => {
                const mine = message.fromUserId === myUserId;
                const peerRead = mine
                  ? (message.readBy || []).includes(selectedUserId)
                  : false;
                const isLatestOutgoing = mine && message.id === latestOutgoingMessageId;
                return (
                  <div
                    key={message.id}
                    className={`flex min-w-0 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-sm break-words [overflow-wrap:anywhere] ${
                        mine ? "bg-[var(--hs-link)] text-white" : "bg-white border border-slate-200 text-slate-700"
                      }`}
                    >
                      {message.text}
                      {isLatestOutgoing ? (
                        <p className="mt-1 text-xs font-medium text-white/80">
                          {peerRead ? "Seen" : "Sent"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>

            <div className="p-3 border-t border-slate-200 bg-white flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (!selectedUserId || !socketRef.current) return;
                  if (typingTimeoutRef.current) {
                    window.clearTimeout(typingTimeoutRef.current);
                  }
                  typingTimeoutRef.current = window.setTimeout(() => {
                    socketRef.current?.emit("quick-chat:typing", {
                      peerUserId: selectedUserId,
                    });
                  }, 250);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
                disabled={!selectedUser}
                placeholder={selectedUser ? "Type message..." : "Choose a user first"}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={!selectedUser || !draft.trim()}
                className="h-10 w-10 rounded-lg bg-[var(--hs-link)] text-white shadow-sm transition hover:bg-[#f96b47] disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="mx-auto h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      {isOpen && isQuickChatSettingsOpen && (
        <div
          className="fixed inset-0 z-[2147482950] flex items-center justify-center bg-black/35 p-4"
          onClick={() => setIsQuickChatSettingsOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Quick Chat Settings</p>
              <button
                type="button"
                onClick={() => setIsQuickChatSettingsOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100"
                title="Close settings"
                aria-label="Close settings"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mb-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Low-End Mode
                </p>
                <p className="text-xs text-slate-400">
                  540p / 10fps screen share
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={lowEndModeEnabled}
                onClick={() => setLowEndModeEnabled((prev) => !prev)}
                title="Toggle low-end mode"
                className={`h-6 rounded-md px-2 text-xs font-semibold text-white transition ${
                  lowEndModeEnabled ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-500 hover:bg-slate-600"
                }`}
              >
                {lowEndModeEnabled ? "ON" : "OFF"}
              </button>
            </div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Ringtone Volume
              </p>
              <span className="text-xs font-semibold text-slate-500">
                {Math.round(ringtoneVolume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.1}
              value={ringtoneVolume}
              onChange={(e) => setRingtoneVolume(Number(e.target.value))}
              className="h-2 w-full cursor-pointer accent-[var(--hs-link)]"
              aria-label="Ringtone volume"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={testRingtone}
                className="h-7 rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                title="Play a ringtone preview"
              >
                Test Ringtone
              </button>
              <button
                type="button"
                onClick={() => {
                  void testMicrophone();
                }}
                className="h-7 rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                title="Check microphone input"
              >
                Test Mic
              </button>
            </div>
          </div>
        </div>
      )}
      {isOpen && isScreenSharePreflightOpen && (
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-white/20 bg-[#0b0f19] p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white">Screen-share preflight</p>
              <div className="inline-flex items-center gap-2">
                {isScreenShareTestRunning ? (
                  <button
                    type="button"
                    onClick={stopScreenShareTest}
                    className="rounded-md border border-amber-300/40 bg-amber-500/20 px-2 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/30"
                  >
                    Stop test
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    stopScreenShareTest();
                    setIsScreenSharePreflightOpen(false);
                  }}
                  className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-xs font-medium text-white hover:bg-white/20"
                >
                  Close
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-white/70">
              Local-only preview. This does not send your screen to teammates.
            </p>
            <video
              ref={screenShareTestPreviewRef}
              autoPlay
              muted
              playsInline
              className="h-[50vh] w-full rounded border border-white/15 bg-black object-contain"
            />
          </div>
        </div>
      )}
      <audio ref={remoteAudioRef} autoPlay />
      {huddleParticipants
        .filter((participantId) => participantId !== myUserId)
        .map((participantId) => (
          <audio
            key={`huddle-audio-${participantId}`}
            autoPlay
            ref={(el) => {
              if (!el) {
                huddleRemoteAudioRefs.current.delete(participantId);
                return;
              }
              huddleRemoteAudioRefs.current.set(participantId, el);
              const existingStream = huddleRemoteStreamsRef.current.get(participantId);
              if (existingStream) {
                el.srcObject = existingStream;
                tryPlayMediaElement(el);
              }
            }}
          />
        ))}
    </>
  );
}
