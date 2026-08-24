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
import * as Y from 'yjs';
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  /** In-memory Yjs documents for wiki live editing (per Socket.IO room). Not persisted across API restarts. */
  private readonly wikiCollabDocs = new Map<string, Y.Doc>();

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
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
}
