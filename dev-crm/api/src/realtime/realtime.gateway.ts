import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import * as Y from 'yjs';
import { JwtService } from '@nestjs/jwt';
import { QuickChatService } from '../quick-chat/quick-chat.service';
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private static readonly ADMIN_PRESENCE_ROOM = 'quick-chat:admin-presence';
  private readonly huddleRooms = new Map<string, Set<string>>();
  private readonly huddleRoomUserSockets = new Map<
    string,
    Map<string, Set<string>>
  >();
  private readonly socketHuddleRooms = new Map<string, Set<string>>();
  private readonly huddleParticipantStates = new Map<
    string,
    Map<string, { muted: boolean; speaking: boolean }>
  >();
  private readonly huddleParticipantNames = new Map<string, Map<string, string>>();
  private readonly huddleJoinGrants = new Map<string, Set<string>>();
  private readonly activeQuickCalls = new Map<
    string,
    { users: [string, string]; startedAt: string }
  >();
  private readonly quickChatUserSockets = new Map<string, Set<string>>();
  private alwaysLiveHuddleRooms = new Set<string>();

  /** In-memory Yjs documents for wiki live editing (per Socket.IO room). Not persisted across API restarts. */
  private readonly wikiCollabDocs = new Map<string, Y.Doc>();

  private static readonly ADMIN_ROLES = new Set([
    'ADMIN',
    'ADMINISTRATOR',
    'SUPER_ADMIN',
    'SUPERADMIN',
    'OWNER',
    'CEO',
    'CTO',
    'MANAGER',
    'HR',
  ]);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly quickChatService: QuickChatService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    const currentUserId = this.getAuthenticatedUserId(client);
    if (currentUserId) {
      const sockets = this.quickChatUserSockets.get(currentUserId) || new Set<string>();
      sockets.add(client.id);
      this.quickChatUserSockets.set(currentUserId, sockets);
      this.broadcastQuickChatOnlineUsers();
    }
    if (this.isAdminUser(client)) {
      client.join(RealtimeGateway.ADMIN_PRESENCE_ROOM);
      client.emit('admin:quick-chat:presence', this.getAdminQuickChatPresence());
    }
    client.emit('huddle:rooms:list', { rooms: this.getPublicHuddleRooms() });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId) return;
    const sockets = this.quickChatUserSockets.get(currentUserId);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) this.quickChatUserSockets.delete(currentUserId);
      else this.quickChatUserSockets.set(currentUserId, sockets);
    }
    this.broadcastQuickChatOnlineUsers();
    this.removeQuickCallsForUser(currentUserId);
    this.removeSocketFromAllHuddles(client.id, currentUserId);
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.join(roomId);
    console.log(`Client ${client.id} joined room ${roomId}`);
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(roomId);
  }

  @SubscribeMessage('page-update')
  handlePageUpdate(
    @MessageBody() data: { roomId: string; patch: Record<string, any> },
  ) {
    if (data.roomId) {
      this.wikiCollabDocs.delete(data.roomId);
    }
    this.server.to(data.roomId).emit('page-updated', data.patch);
  }

  @SubscribeMessage('wiki-collab-request-state')
  handleWikiCollabRequestState(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = String(data?.roomId || '').trim();
    if (!roomId) return;
    const doc = this.wikiCollabDocs.get(roomId);
    if (doc) {
      const update = Y.encodeStateAsUpdate(doc);
      client.emit('wiki-collab-sync', { update: Array.from(update) });
    } else {
      client.emit('wiki-collab-sync', { update: [] });
    }
  }

  @SubscribeMessage('wiki-collab-update')
  handleWikiCollabUpdate(
    @MessageBody() data: { roomId: string; update: number[] },
    @ConnectedSocket() client: Socket,
  ) {
    const roomId = String(data?.roomId || '').trim();
    if (!roomId || !Array.isArray(data?.update) || data.update.length === 0) {
      return;
    }
    const u = new Uint8Array(data.update);
    let doc = this.wikiCollabDocs.get(roomId);
    if (!doc) {
      doc = new Y.Doc();
      this.wikiCollabDocs.set(roomId, doc);
    }
    Y.applyUpdate(doc, u);
    client.to(roomId).emit('wiki-collab-update', { update: data.update });
  }

  @SubscribeMessage('cursor-move')
  handleCursorMove(
    @MessageBody()
    data: {
      roomId: string;
      userId: string;
      position: { x: number; y: number };
    },
  ) {
    this.server
      .to(data.roomId)
      .emit('cursor-moved', { userId: data.userId, position: data.position });
  }

  // Redis Pub/Sub could be added here for multi-node scalability

  sendNotification(userId: string, data: any) {
    this.server.to(userId).emit('notification', data);
    console.log(`Notification sent to user ${userId}`);
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(userId).emit(event, data);
  }

  private getTokenFromClient(client: Socket) {
    const tokenFromAuth =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : '';
    const authHeader =
      typeof client.handshake.headers?.authorization === 'string'
        ? client.handshake.headers.authorization
        : '';
    const tokenFromHeader = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';
    return tokenFromAuth || tokenFromHeader;
  }

  private getAuthenticatedUserId(client: Socket) {
    const token = this.getTokenFromClient(client);
    if (!token) return null;
    try {
      const payload = this.jwtService.verify(token);
      return String(payload?.sub || '');
    } catch {
      return null;
    }
  }

  private getGuestIdentity(client: Socket) {
    const rawName =
      typeof (client.handshake.auth as any)?.guestName === 'string'
        ? String((client.handshake.auth as any).guestName).trim()
        : '';
    const rawGuestId =
      typeof (client.handshake.auth as any)?.guestId === 'string'
        ? String((client.handshake.auth as any).guestId).trim()
        : '';
    if (!rawName) return null;
    const safeName = rawName.slice(0, 80);
    const safeGuestId = rawGuestId ? rawGuestId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) : '';
    const id = safeGuestId ? `guest:${safeGuestId}` : `guest:${client.id}`;
    return { id, name: safeName };
  }

  private getHuddleActor(client: Socket) {
    const authUserId = this.getAuthenticatedUserId(client);
    if (authUserId) {
      const authName =
        String((client.handshake.auth as any)?.userName || '').trim() || 'Teammate';
      return {
        userId: authUserId,
        displayName: authName,
        isGuest: false,
      };
    }
    const guest = this.getGuestIdentity(client);
    if (!guest) return null;
    return {
      userId: guest.id,
      displayName: guest.name,
      isGuest: true,
    };
  }

  private isAdminUser(client: Socket): boolean {
    const token = this.getTokenFromClient(client);
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token) as Record<string, any>;
      const rawRole = payload?.role;
      const roleName =
        typeof rawRole === 'string'
          ? rawRole
          : typeof rawRole?.name === 'string'
            ? rawRole.name
            : '';
      return RealtimeGateway.ADMIN_ROLES.has(String(roleName).toUpperCase());
    } catch {
      return false;
    }
  }

  @SubscribeMessage('quick-chat:history:request')
  async handleQuickChatHistoryRequest(
    @MessageBody() data: { peerUserId: string; limit?: number },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.peerUserId) return;
    const messages = await this.quickChatService.getMessages(
      currentUserId,
      String(data.peerUserId),
      Number(data.limit || 100),
    );
    client.emit('quick-chat:history:response', {
      peerUserId: String(data.peerUserId),
      messages,
    });
  }

  @SubscribeMessage('quick-chat:send')
  async handleQuickChatSend(
    @MessageBody() data: { toUserId: string; text: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId || !data?.text) return;

    const created = await this.quickChatService.sendMessage(
      currentUserId,
      String(data.toUserId),
      String(data.text),
    );
    if (!created) return;

    this.server.to(currentUserId).emit('quick-chat:new-message', created);
    this.server.to(String(data.toUserId)).emit('quick-chat:new-message', created);
  }

  @SubscribeMessage('quick-chat:typing')
  async handleQuickChatTyping(
    @MessageBody() data: { peerUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.peerUserId) return;

    const allowed = await this.quickChatService.setTyping(
      currentUserId,
      String(data.peerUserId),
    );
    if (!allowed) return;

    this.server.to(String(data.peerUserId)).emit('quick-chat:typing', {
      fromUserId: currentUserId,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('quick-chat:mark-read')
  async handleQuickChatMarkRead(
    @MessageBody() data: { peerUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    const peerUserId = String(data?.peerUserId || '').trim();
    if (!currentUserId || !peerUserId) return;
    const result = await this.quickChatService.markConversationRead(
      currentUserId,
      peerUserId,
    );
    if (!result || Number((result as any).updated || 0) <= 0) return;
    const payload = {
      peerUserId,
      readerUserId: currentUserId,
      conversationKey:
        (result as any).conversationKey || this.getQuickCallKey(currentUserId, peerUserId),
      readAt: (result as any).readAt || new Date().toISOString(),
    };
    this.server.to(currentUserId).emit('quick-chat:messages-read', payload);
    this.server.to(peerUserId).emit('quick-chat:messages-read', payload);
  }

  @SubscribeMessage('quick-call:offer')
  async handleQuickCallOffer(
    @MessageBody() data: { toUserId: string; offer: any },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId || !data?.offer) return;
    const canCall = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!canCall) return;
    this.server.to(String(data.toUserId)).emit('quick-call:offer', {
      fromUserId: currentUserId,
      offer: data.offer,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('quick-call:answer')
  async handleQuickCallAnswer(
    @MessageBody() data: { toUserId: string; answer: any },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId || !data?.answer) return;
    const canCall = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!canCall) return;
    this.setActiveQuickCall(currentUserId, String(data.toUserId));
    this.server.to(String(data.toUserId)).emit('quick-call:answer', {
      fromUserId: currentUserId,
      answer: data.answer,
      at: new Date().toISOString(),
    });
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('quick-call:ice-candidate')
  async handleQuickCallIceCandidate(
    @MessageBody() data: { toUserId: string; candidate: any },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId || !data?.candidate) return;
    const canCall = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!canCall) return;
    this.server.to(String(data.toUserId)).emit('quick-call:ice-candidate', {
      fromUserId: currentUserId,
      candidate: data.candidate,
    });
  }

  @SubscribeMessage('quick-call:end')
  async handleQuickCallEnd(
    @MessageBody() data: { toUserId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId) return;
    const canCall = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!canCall) return;
    this.removeActiveQuickCall(currentUserId, String(data.toUserId));
    this.server.to(String(data.toUserId)).emit('quick-call:end', {
      fromUserId: currentUserId,
      reason: data.reason || 'ended',
      at: new Date().toISOString(),
    });
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('quick-call:busy')
  async handleQuickCallBusy(
    @MessageBody() data: { toUserId: string; reason?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.toUserId) return;
    const canCall = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!canCall) return;
    this.removeActiveQuickCall(currentUserId, String(data.toUserId));
    this.server.to(String(data.toUserId)).emit('quick-call:busy', {
      fromUserId: currentUserId,
      reason: data.reason || 'busy',
      at: new Date().toISOString(),
    });
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('huddle:join')
  handleHuddleJoin(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const actor = this.getHuddleActor(client);
    const roomId = String(data?.roomId || '').trim();
    if (!actor?.userId || !roomId) return;
    const currentUserId = actor.userId;
    const actorDisplayName = actor.displayName;
    const isAdmin = this.isAdminUser(client);

    const roomKey = this.getHuddleRoomKey(roomId);
    const members = this.huddleRooms.get(roomKey) || new Set<string>();
    const grants = this.huddleJoinGrants.get(roomKey) || new Set<string>();
    const roomAlreadyActive = members.size > 0;
    if (roomAlreadyActive && !members.has(currentUserId) && !isAdmin) {
      // Non-member can join active room only when explicitly invited/granted.
      if (!grants.has(currentUserId)) {
        this.server.to(roomKey).emit('huddle:join-requested', {
          roomId,
          requesterUserId: currentUserId,
          requesterSocketId: client.id,
          requesterName: actorDisplayName || 'Guest',
          requesterIsGuest: !!actor.isGuest,
          at: new Date().toISOString(),
        });
        client.emit('huddle:join-pending', {
          roomId,
          message:
            'Join request sent. Waiting for approval from room members.',
        });
        return;
      }
      grants.delete(currentUserId);
      this.huddleJoinGrants.set(roomKey, grants);
    }

    this.addSocketToHuddleRoom(roomKey, currentUserId, client.id);
    members.clear();
    this.getHuddleRoomMembers(roomKey).forEach((memberId) => members.add(memberId));
    this.huddleRooms.set(roomKey, members);
    const roomStates = this.huddleParticipantStates.get(roomKey) || new Map();
    if (!roomStates.has(currentUserId)) {
      roomStates.set(currentUserId, { muted: false, speaking: false });
    }
    this.huddleParticipantStates.set(roomKey, roomStates);
    const roomNames = this.huddleParticipantNames.get(roomKey) || new Map();
    roomNames.set(currentUserId, actorDisplayName || 'Teammate');
    this.huddleParticipantNames.set(roomKey, roomNames);

    client.join(roomKey);
    client.emit('huddle:joined', {
      roomId,
      participants: Array.from(members),
      participantNames: this.serializeHuddleParticipantNames(roomKey),
    });
    this.server.to(roomKey).emit('huddle:user-joined', {
      roomId,
      userId: currentUserId,
      participants: Array.from(members),
      participantNames: this.serializeHuddleParticipantNames(roomKey),
    });
    this.server.to(roomKey).emit('huddle:participants-state', {
      roomId,
      states: this.serializeHuddleParticipantStates(roomKey),
    });
    this.broadcastHuddleRoomList();
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('huddle:join-request-response')
  handleHuddleJoinRequestResponse(
    @MessageBody()
    data: {
      roomId: string;
      requesterUserId: string;
      requesterSocketId?: string;
      status: 'accepted' | 'rejected';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    const roomId = String(data?.roomId || '').trim();
    const requesterUserId = String(data?.requesterUserId || '').trim();
    const requesterSocketId = String(data?.requesterSocketId || '').trim();
    const status = data?.status;
    if (!currentUserId || !roomId || !requesterUserId || !status) return;

    const roomKey = this.getHuddleRoomKey(roomId);
    const members = this.huddleRooms.get(roomKey);
    const isAdmin = this.isAdminUser(client);
    if (!members || (!members.has(currentUserId) && !isAdmin)) return;

    if (status === 'accepted') {
      const grants = this.huddleJoinGrants.get(roomKey) || new Set<string>();
      grants.add(requesterUserId);
      this.huddleJoinGrants.set(roomKey, grants);
    }

    const responsePayload = {
      roomId,
      fromUserId: currentUserId,
      status,
      at: new Date().toISOString(),
    };
    if (requesterSocketId) {
      this.server.to(requesterSocketId).emit('huddle:join-request-response', responsePayload);
    }
    this.server.to(requesterUserId).emit('huddle:join-request-response', responsePayload);
  }

  @SubscribeMessage('huddle:leave')
  handleHuddleLeave(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const actor = this.getHuddleActor(client);
    const roomId = String(data?.roomId || '').trim();
    if (!actor?.userId || !roomId) return;
    const currentUserId = actor.userId;

    const roomKey = this.getHuddleRoomKey(roomId);
    const grantsBeforeLeave = this.huddleJoinGrants.get(roomKey) || new Set<string>();
    grantsBeforeLeave.add(currentUserId);
    this.huddleJoinGrants.set(roomKey, grantsBeforeLeave);
    const userWasMember = this.huddleRooms.get(roomKey)?.has(currentUserId) || false;
    this.removeSocketFromHuddleRoom(roomKey, currentUserId, client.id);
    client.leave(roomKey);
    const members = Array.from(this.huddleRooms.get(roomKey) || []);
    const userStillMember = this.huddleRooms.get(roomKey)?.has(currentUserId) || false;
    if (userWasMember && !userStillMember) {
      this.server.to(roomKey).emit('huddle:user-left', {
        roomId,
        userId: currentUserId,
        participants: members,
        participantNames: this.serializeHuddleParticipantNames(roomKey),
      });
    }
    this.broadcastHuddleRoomList();
    this.broadcastAdminQuickChatPresence();
  }

  @SubscribeMessage('huddle:signal')
  handleHuddleSignal(
    @MessageBody()
    data: {
      roomId: string;
      toUserId: string;
      description?: any;
      candidate?: any;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const actor = this.getHuddleActor(client);
    const roomId = String(data?.roomId || '').trim();
    const toUserId = String(data?.toUserId || '').trim();
    if (!actor?.userId || !roomId || !toUserId) return;
    const currentUserId = actor.userId;

    const roomKey = this.getHuddleRoomKey(roomId);
    const members = this.huddleRooms.get(roomKey);
    if (!members?.has(currentUserId) || !members?.has(toUserId)) return;

    this.server.to(toUserId).emit('huddle:signal', {
      roomId,
      fromUserId: currentUserId,
      description: data.description,
      candidate: data.candidate,
    });
  }

  @SubscribeMessage('huddle:participant-state')
  handleHuddleParticipantState(
    @MessageBody()
    data: {
      roomId: string;
      muted?: boolean;
      speaking?: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const actor = this.getHuddleActor(client);
    const roomId = String(data?.roomId || '').trim();
    if (!actor?.userId || !roomId) return;
    const currentUserId = actor.userId;
    const roomKey = this.getHuddleRoomKey(roomId);
    const members = this.huddleRooms.get(roomKey);
    if (!members?.has(currentUserId)) return;

    const states = this.huddleParticipantStates.get(roomKey) || new Map();
    const prev = states.get(currentUserId) || { muted: false, speaking: false };
    const nextState = {
      muted:
        typeof data?.muted === 'boolean' ? data.muted : prev.muted,
      speaking:
        typeof data?.speaking === 'boolean' ? data.speaking : prev.speaking,
    };
    states.set(currentUserId, nextState);
    this.huddleParticipantStates.set(roomKey, states);
    this.server.to(roomKey).emit('huddle:participant-state', {
      roomId,
      userId: currentUserId,
      ...nextState,
    });
  }

  @SubscribeMessage('huddle:invite')
  async handleHuddleInvite(
    @MessageBody() data: { roomId: string; toUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    const roomId = String(data?.roomId || '').trim();
    const toUserId = String(data?.toUserId || '').trim();
    if (!currentUserId || !roomId || !toUserId) return;

    const allowed = await this.quickChatService.canUsersChat(currentUserId, toUserId);
    if (!allowed) return;
    const roomKey = this.getHuddleRoomKey(roomId);
    const grants = this.huddleJoinGrants.get(roomKey) || new Set<string>();
    grants.add(toUserId);
    this.huddleJoinGrants.set(roomKey, grants);

    this.server.to(toUserId).emit('huddle:invite', {
      roomId,
      fromUserId: currentUserId,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('huddle:invite-response')
  async handleHuddleInviteResponse(
    @MessageBody()
    data: {
      roomId: string;
      toUserId: string;
      status: 'accepted' | 'rejected' | 'busy';
    },
    @ConnectedSocket() client: Socket,
  ) {
    const currentUserId = this.getAuthenticatedUserId(client);
    if (!currentUserId || !data?.roomId || !data?.toUserId || !data?.status) return;
    const allowed = await this.quickChatService.canUsersChat(
      currentUserId,
      String(data.toUserId),
    );
    if (!allowed) return;
    this.server.to(String(data.toUserId)).emit('huddle:invite-response', {
      roomId: String(data.roomId),
      fromUserId: currentUserId,
      status: data.status,
      at: new Date().toISOString(),
    });
  }

  private getHuddleRoomKey(roomId: string) {
    return `huddle:${roomId}`;
  }

  setAlwaysLiveHuddleRooms(roomIds: string[]) {
    const next = new Set(
      (roomIds || [])
        .map((id) => String(id || '').trim().toLowerCase())
        .filter(Boolean),
    );
    this.alwaysLiveHuddleRooms = next;
  }

  private getHuddleRoomMembers(roomKey: string) {
    const userSockets = this.huddleRoomUserSockets.get(roomKey);
    if (!userSockets) return new Set<string>();
    const out = new Set<string>();
    userSockets.forEach((socketIds, userId) => {
      if (socketIds.size > 0) out.add(userId);
    });
    return out;
  }

  private addSocketToHuddleRoom(
    roomKey: string,
    userId: string,
    socketId: string,
  ) {
    const roomSockets = this.huddleRoomUserSockets.get(roomKey) || new Map();
    const userSockets = roomSockets.get(userId) || new Set<string>();
    userSockets.add(socketId);
    roomSockets.set(userId, userSockets);
    this.huddleRoomUserSockets.set(roomKey, roomSockets);

    const socketRooms = this.socketHuddleRooms.get(socketId) || new Set<string>();
    socketRooms.add(roomKey);
    this.socketHuddleRooms.set(socketId, socketRooms);
  }

  private removeSocketFromHuddleRoom(
    roomKey: string,
    userId: string,
    socketId: string,
  ) {
    const roomSockets = this.huddleRoomUserSockets.get(roomKey);
    if (!roomSockets) return;
    const userSockets = roomSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        roomSockets.delete(userId);
      } else {
        roomSockets.set(userId, userSockets);
      }
    }
    if (roomSockets.size === 0) {
      this.huddleRoomUserSockets.delete(roomKey);
    } else {
      this.huddleRoomUserSockets.set(roomKey, roomSockets);
    }

    const socketRooms = this.socketHuddleRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(roomKey);
      if (socketRooms.size === 0) this.socketHuddleRooms.delete(socketId);
      else this.socketHuddleRooms.set(socketId, socketRooms);
    }

    const members = this.getHuddleRoomMembers(roomKey);
    const states = this.huddleParticipantStates.get(roomKey);
    const names = this.huddleParticipantNames.get(roomKey);
    if (states) {
      Array.from(states.keys()).forEach((memberId) => {
        if (!members.has(memberId)) states.delete(memberId);
      });
    }
    if (names) {
      Array.from(names.keys()).forEach((memberId) => {
        if (!members.has(memberId)) names.delete(memberId);
      });
    }
    if (members.size === 0) {
      this.huddleRooms.delete(roomKey);
      this.huddleParticipantStates.delete(roomKey);
      this.huddleParticipantNames.delete(roomKey);
      this.huddleJoinGrants.delete(roomKey);
      return;
    }
    this.huddleRooms.set(roomKey, members);
    if (states) this.huddleParticipantStates.set(roomKey, states);
    if (names) this.huddleParticipantNames.set(roomKey, names);
  }

  private removeSocketFromAllHuddles(socketId: string, userId: string) {
    const roomKeys = Array.from(this.socketHuddleRooms.get(socketId) || []);
    roomKeys.forEach((roomKey) => {
      const roomId = roomKey.replace(/^huddle:/, '');
      const grants = this.huddleJoinGrants.get(roomKey) || new Set<string>();
      grants.add(userId);
      this.huddleJoinGrants.set(roomKey, grants);
      const userWasMember = this.huddleRooms.get(roomKey)?.has(userId) || false;
      this.removeSocketFromHuddleRoom(roomKey, userId, socketId);
      const userStillMember = this.huddleRooms.get(roomKey)?.has(userId) || false;
      if (userWasMember && !userStillMember) {
        this.server.to(roomKey).emit('huddle:user-left', {
          roomId,
          userId,
          participants: Array.from(this.huddleRooms.get(roomKey) || []),
          participantNames: this.serializeHuddleParticipantNames(roomKey),
        });
      }
    });
    this.broadcastHuddleRoomList();
  }

  @SubscribeMessage('huddle:rooms:list')
  handleHuddleRoomsList(@ConnectedSocket() client: Socket) {
    client.emit('huddle:rooms:list', { rooms: this.getPublicHuddleRooms() });
  }

  @SubscribeMessage('admin:quick-chat:presence:request')
  handleAdminQuickChatPresenceRequest(@ConnectedSocket() client: Socket) {
    if (!this.isAdminUser(client)) return;
    client.emit('admin:quick-chat:presence', this.getAdminQuickChatPresence());
  }

  private getPublicHuddleRooms() {
    const activeRooms = Array.from(this.huddleRooms.entries())
      .map(([roomKey, members]) => ({
        roomId: roomKey.replace(/^huddle:/, ''),
        participantCount: members.size,
      }));
    const alwaysLiveRooms = Array.from(this.alwaysLiveHuddleRooms.values()).map((roomId) => ({
      roomId,
      participantCount: this.huddleRooms.get(this.getHuddleRoomKey(roomId))?.size || 0,
    }));
    const dedupe = new Map<string, { roomId: string; participantCount: number }>();
    [...activeRooms, ...alwaysLiveRooms].forEach((room) => {
      if (!room.roomId) return;
      const key = String(room.roomId).trim();
      const existing = dedupe.get(key);
      if (!existing || room.participantCount > existing.participantCount) {
        dedupe.set(key, {
          roomId: key,
          participantCount: Number(room.participantCount || 0),
        });
      }
    });
    return Array.from(dedupe.values())
      .sort((a, b) => b.participantCount - a.participantCount || a.roomId.localeCompare(b.roomId));
  }

  private broadcastHuddleRoomList() {
    this.server.emit('huddle:rooms:list', { rooms: this.getPublicHuddleRooms() });
  }

  private serializeHuddleParticipantStates(roomKey: string) {
    const states = this.huddleParticipantStates.get(roomKey);
    if (!states) return {};
    const out: Record<string, { muted: boolean; speaking: boolean }> = {};
    states.forEach((value, userId) => {
      out[userId] = value;
    });
    return out;
  }

  private serializeHuddleParticipantNames(roomKey: string) {
    const names = this.huddleParticipantNames.get(roomKey);
    if (!names) return {};
    const out: Record<string, string> = {};
    names.forEach((value, userId) => {
      out[userId] = value;
    });
    return out;
  }

  private broadcastQuickChatOnlineUsers() {
    const onlineUserIds = Array.from(this.quickChatUserSockets.entries())
      .filter(([, sockets]) => sockets.size > 0)
      .map(([userId]) => userId);
    this.server.emit('quick-chat:online-users', {
      onlineUserIds,
      generatedAt: new Date().toISOString(),
    });
  }

  private getQuickCallKey(a: string, b: string) {
    return [String(a), String(b)].sort().join('::');
  }

  private setActiveQuickCall(a: string, b: string) {
    const key = this.getQuickCallKey(a, b);
    this.activeQuickCalls.set(key, {
      users: [String(a), String(b)].sort() as [string, string],
      startedAt: new Date().toISOString(),
    });
  }

  private removeActiveQuickCall(a: string, b: string) {
    const key = this.getQuickCallKey(a, b);
    this.activeQuickCalls.delete(key);
  }

  private removeQuickCallsForUser(userId: string) {
    for (const [key, call] of this.activeQuickCalls.entries()) {
      if (call.users.includes(userId)) {
        this.activeQuickCalls.delete(key);
      }
    }
  }

  private getAdminQuickChatPresence() {
    const activeCalls = Array.from(this.activeQuickCalls.values()).map((call) => ({
      users: call.users,
      startedAt: call.startedAt,
    }));
    const activeHuddles = Array.from(this.huddleRooms.entries())
      .map(([roomKey, members]) => ({
        roomId: roomKey.replace(/^huddle:/, ''),
        participants: Array.from(members),
      }))
      .sort(
        (a, b) =>
          b.participants.length - a.participants.length ||
          a.roomId.localeCompare(b.roomId),
      );

    return {
      activeCalls,
      activeHuddles,
      generatedAt: new Date().toISOString(),
    };
  }

  private broadcastAdminQuickChatPresence() {
    this.server
      .to(RealtimeGateway.ADMIN_PRESENCE_ROOM)
      .emit('admin:quick-chat:presence', this.getAdminQuickChatPresence());
  }
}
