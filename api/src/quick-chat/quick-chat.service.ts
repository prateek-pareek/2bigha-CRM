import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  QuickChatMessage,
  QuickChatMessageDocument,
} from './schemas/quick-chat-message.schema';
import {
  QuickChatConversationState,
  QuickChatConversationStateDocument,
} from './schemas/quick-chat-conversation-state.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

const ADMIN_ROLES = new Set([
  'ADMIN',
  'CEO',
  'CTO',
  'MANAGER',
  'EXECUTIVE',
  'SENIOR MEMBER',
  'ADMINISTRATOR',
  'SUPERADMIN',
  'SUPER_ADMIN',
  'OWNER',
]);

@Injectable()
export class QuickChatService {
  constructor(
    @InjectModel(QuickChatMessage.name)
    private readonly quickChatMessageModel: Model<QuickChatMessageDocument>,
    @InjectModel(QuickChatConversationState.name)
    private readonly quickChatConversationStateModel: Model<QuickChatConversationStateDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private getConversationKey(a: string, b: string) {
    return [String(a), String(b)].sort().join('::');
  }

  private isAdminRole(role: string) {
    return ADMIN_ROLES.has(String(role || '').toUpperCase().trim());
  }

  private asUserId(value: unknown) {
    return String(value || '');
  }

  async getAllowedContacts(currentUserId: string) {
    const me = await this.userModel.findById(currentUserId).lean();
    if (!me) return [];

    const myTools = new Set((me.permittedTools || []).map((t) => String(t).toUpperCase()));
    const isAdmin = this.isAdminRole(me.role);
    const allUsers = await this.userModel
      .find({}, { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1, permittedTools: 1 })
      .lean();

    return allUsers
      .filter((user: any) => this.asUserId(user._id) !== currentUserId)
      .filter((user: any) => {
        if (isAdmin) return true;
        const theirTools = new Set((user.permittedTools || []).map((t: string) => String(t).toUpperCase()));
        for (const tool of myTools) {
          if (theirTools.has(tool)) return true;
        }
        return false;
      })
      .map((user: any) => ({
        _id: this.asUserId(user._id),
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        role: user.role || '',
      }));
  }

  async canUsersChat(a: string, b: string) {
    const [contactsForA, contactsForB] = await Promise.all([
      this.getAllowedContacts(a),
      this.getAllowedContacts(b),
    ]);
    const aCanReachB = contactsForA.some((contact) => contact._id === b);
    const bCanReachA = contactsForB.some((contact) => contact._id === a);
    return aCanReachB || bCanReachA;
  }

  async sendMessage(fromUserId: string, toUserId: string, text: string) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;
    if (fromUserId === toUserId) return null;

    const allowed = await this.canUsersChat(fromUserId, toUserId);
    if (!allowed) return null;

    const conversationKey = this.getConversationKey(fromUserId, toUserId);
    const created = await this.quickChatMessageModel.create({
      conversationKey,
      participants: [fromUserId, toUserId],
      fromUserId,
      toUserId,
      text: cleanText,
      readBy: [fromUserId],
    });

    await this.quickChatConversationStateModel
      .findOneAndUpdate(
        { conversationKey },
        {
          $setOnInsert: { participants: [fromUserId, toUserId], conversationKey },
          $set: { [`lastReadAt.${fromUserId}`]: new Date().toISOString() },
        },
        { upsert: true, new: true },
      )
      .exec();

    return {
      id: this.asUserId((created as any)._id),
      fromUserId,
      toUserId,
      text: created.text,
      createdAt: (created as any).createdAt,
      readBy: [fromUserId],
    };
  }

  async getMessages(currentUserId: string, peerUserId: string, limit = 100) {
    const allowed = await this.canUsersChat(currentUserId, peerUserId);
    if (!allowed) return [];

    const conversationKey = this.getConversationKey(currentUserId, peerUserId);
    const docs = await this.quickChatMessageModel
      .find({ conversationKey })
      .sort({ createdAt: 1 })
      .limit(Math.max(1, Math.min(limit, 200)))
      .lean();

    return docs.map((doc: any) => ({
      id: this.asUserId(doc._id),
      fromUserId: doc.fromUserId,
      toUserId: doc.toUserId,
      text: doc.text,
      createdAt: doc.createdAt,
      readBy: Array.isArray(doc.readBy) ? doc.readBy : [],
    }));
  }

  async markConversationRead(currentUserId: string, peerUserId: string) {
    const allowed = await this.canUsersChat(currentUserId, peerUserId);
    if (!allowed) return { updated: 0 };

    const conversationKey = this.getConversationKey(currentUserId, peerUserId);
    const updateResult = await this.quickChatMessageModel
      .updateMany(
        { conversationKey, toUserId: currentUserId, readBy: { $ne: currentUserId } },
        { $addToSet: { readBy: currentUserId } },
      )
      .exec();

    await this.quickChatConversationStateModel
      .findOneAndUpdate(
        { conversationKey },
        {
          $setOnInsert: { participants: [currentUserId, peerUserId], conversationKey },
          $set: { [`lastReadAt.${currentUserId}`]: new Date().toISOString() },
        },
        { upsert: true },
      )
      .exec();

    return {
      updated: updateResult.modifiedCount || 0,
      conversationKey,
      readAt: new Date().toISOString(),
    };
  }

  async setTyping(currentUserId: string, peerUserId: string) {
    const allowed = await this.canUsersChat(currentUserId, peerUserId);
    if (!allowed) return false;

    const conversationKey = this.getConversationKey(currentUserId, peerUserId);
    await this.quickChatConversationStateModel
      .findOneAndUpdate(
        { conversationKey },
        {
          $setOnInsert: { participants: [currentUserId, peerUserId], conversationKey },
          $set: { [`lastTypingAt.${currentUserId}`]: new Date().toISOString() },
        },
        { upsert: true },
      )
      .exec();
    return true;
  }

  async getConversations(currentUserId: string) {
    const messages = await this.quickChatMessageModel
      .find({ participants: currentUserId })
      .sort({ createdAt: -1 })
      .lean();

    const byConversation = new Map<string, any>();
    for (const msg of messages) {
      if (!byConversation.has(msg.conversationKey)) {
        byConversation.set(msg.conversationKey, msg);
      }
    }
    const latest = Array.from(byConversation.values());
    const peerIds = Array.from(
      new Set(
        latest.map((msg) =>
          msg.fromUserId === currentUserId ? msg.toUserId : msg.fromUserId,
        ),
      ),
    );

    const [states, peers] = await Promise.all([
      this.quickChatConversationStateModel
        .find({ participants: currentUserId })
        .lean(),
      this.userModel
        .find(
          { _id: { $in: peerIds.map((id) => new Types.ObjectId(id)) } },
          { _id: 1, firstName: 1, lastName: 1, email: 1, role: 1 },
        )
        .lean(),
    ]);

    const statesByKey = new Map(
      states.map((state: any) => [state.conversationKey, state]),
    );
    const peersById = new Map(
      peers.map((peer: any) => [this.asUserId(peer._id), peer]),
    );

    const unreadCounts = await this.quickChatMessageModel.aggregate([
      { $match: { toUserId: currentUserId, readBy: { $ne: currentUserId } } },
      { $group: { _id: '$conversationKey', count: { $sum: 1 } } },
    ]);
    const unreadByKey = new Map(
      unreadCounts.map((row: any) => [row._id, Number(row.count || 0)]),
    );

    return latest
      .map((msg: any) => {
        const peerUserId =
          msg.fromUserId === currentUserId ? msg.toUserId : msg.fromUserId;
        const peer = peersById.get(peerUserId);
        const state = statesByKey.get(msg.conversationKey);
        return {
          conversationKey: msg.conversationKey,
          peerUser: peer
            ? {
                _id: this.asUserId(peer._id),
                firstName: peer.firstName || '',
                lastName: peer.lastName || '',
                email: peer.email || '',
                role: peer.role || '',
              }
            : null,
          lastMessage: {
            id: this.asUserId(msg._id),
            fromUserId: msg.fromUserId,
            toUserId: msg.toUserId,
            text: msg.text,
            createdAt: msg.createdAt,
          },
          unreadCount: unreadByKey.get(msg.conversationKey) || 0,
          peerLastSeenAt: state?.lastReadAt?.[peerUserId] || null,
          peerLastTypingAt: state?.lastTypingAt?.[peerUserId] || null,
        };
      })
      .filter((row) => !!row.peerUser);
  }

  async deleteConversationBetweenUsers(userA: string, userB: string) {
    const conversationKey = this.getConversationKey(userA, userB);
    const [messagesResult] = await Promise.all([
      this.quickChatMessageModel.deleteMany({ conversationKey }).exec(),
      this.quickChatConversationStateModel
        .deleteOne({ conversationKey })
        .exec(),
    ]);
    return {
      deletedMessages: messagesResult.deletedCount || 0,
      conversationKey,
    };
  }

  async deleteAllChatsForUser(targetUserId: string) {
    const conversationKeys = await this.quickChatMessageModel
      .distinct('conversationKey', { participants: targetUserId })
      .exec();

    const [messagesResult] = await Promise.all([
      this.quickChatMessageModel
        .deleteMany({ participants: targetUserId })
        .exec(),
      this.quickChatConversationStateModel
        .deleteMany({ participants: targetUserId })
        .exec(),
    ]);

    return {
      deletedMessages: messagesResult.deletedCount || 0,
      deletedConversations: conversationKeys.length,
      targetUserId,
    };
  }
}

