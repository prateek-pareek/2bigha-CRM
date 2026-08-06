import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserEmailAccountDocument = UserEmailAccount & Document;

@Schema({ timestamps: true })
export class UserEmailAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  email: string;

  @Prop({
    required: true,
    enum: [
      'gmail',
      'outlook',
      'outlook_personal',
      'yahoo',
      'zoho',
      'zoho_eu',
      'zoho_in',
      'godaddy',
      'hostinger',
      'ionos',
      'other',
    ],
  })
  provider: string;

  @Prop({ default: '' })
  displayName: string;

  @Prop({ default: '' })
  accountLabel: string;

  /** Which outreach stream this mailbox is used for (inbox account tabs / filtering). */
  @Prop({ type: String, enum: ['agency', 'freelancer', 'both'] })
  outreachType?: 'agency' | 'freelancer' | 'both';

  // IMAP config (for fetching inbox)
  @Prop({ required: true })
  imapHost: string;

  @Prop({ default: 993 })
  imapPort: number;

  @Prop({ default: true })
  imapSecure: boolean;

  @Prop({ required: true })
  imapUser: string;

  /** Used when authType is password; empty for OAuth accounts */
  @Prop({ default: '' })
  imapPassword: string;

  // SMTP config (for sending)
  @Prop({ required: true })
  smtpHost: string;

  @Prop({ default: 587 })
  smtpPort: number;

  @Prop({ default: true })
  smtpSecure: boolean;

  @Prop({ required: true })
  smtpUser: string;

  /** Used when authType is password; empty for OAuth accounts */
  @Prop({ default: '' })
  smtpPassword: string;

  @Prop({ enum: ['password', 'oauth'], default: 'password' })
  authType: 'password' | 'oauth';

  @Prop({ default: '' })
  oauthRefreshToken: string;

  @Prop({ default: '' })
  oauthAccessToken: string;

  @Prop({ type: Date })
  oauthAccessTokenExpiresAt?: Date;

  /** Outlook OAuth: use Microsoft Graph for sync/send (works when tenant disables SMTP AUTH). */
  @Prop({ default: false })
  microsoftGraphMail: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isDefault: boolean;

  /** Per-account preference: use persistent IMAP IDLE realtime listener when eligible. */
  @Prop({ default: true })
  preferImapIdle: boolean;

  @Prop({ type: Date })
  lastSyncedAt?: Date;

  @Prop({
    type: {
      lastSyncAttemptAt: { type: Date },
      lastSyncSuccessAt: { type: Date },
      nextAllowedSyncAt: { type: Date },
      consecutiveFailures: { type: Number, default: 0 },
      consecutiveIdleSyncs: { type: Number, default: 0 },
      lastSyncResultCount: { type: Number, default: 0 },
      lastError: { type: String, default: '' },
      lastErrorAt: { type: Date },
    },
    default: {},
  })
  syncState?: {
    lastSyncAttemptAt?: Date;
    lastSyncSuccessAt?: Date;
    nextAllowedSyncAt?: Date;
    consecutiveFailures?: number;
    consecutiveIdleSyncs?: number;
    lastSyncResultCount?: number;
    lastError?: string;
    lastErrorAt?: Date;
  };

  @Prop({
    type: {
      provider: { type: String, default: '' },
      graphSubscriptionId: { type: String, default: '' },
      graphSubscriptionExpiresAt: { type: Date },
      graphClientState: { type: String, default: '' },
      gmailWatchExpirationAt: { type: Date },
      gmailHistoryId: { type: String, default: '' },
      lastPushReceivedAt: { type: Date },
      lastPushError: { type: String, default: '' },
      lastPushErrorAt: { type: Date },
    },
    default: {},
  })
  pushState?: {
    provider?: string;
    graphSubscriptionId?: string;
    graphSubscriptionExpiresAt?: Date;
    graphClientState?: string;
    gmailWatchExpirationAt?: Date;
    gmailHistoryId?: string;
    lastPushReceivedAt?: Date;
    lastPushError?: string;
    lastPushErrorAt?: Date;
  };

  @Prop({
    type: {
      enabled: { type: Boolean, default: false },
      maxEmailsPerHour: { type: Number, default: null },
      maxEmailsPerDay: { type: Number, default: null },
    },
    default: {
      enabled: false,
      maxEmailsPerHour: null,
      maxEmailsPerDay: null,
    },
  })
  sendLimitOverride?: {
    enabled: boolean;
    maxEmailsPerHour?: number | null;
    maxEmailsPerDay?: number | null;
  };

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWithUserIds: Types.ObjectId[];
}

export const UserEmailAccountSchema =
  SchemaFactory.createForClass(UserEmailAccount);

UserEmailAccountSchema.index({ userId: 1 });
UserEmailAccountSchema.index({ userId: 1, email: 1 }, { unique: true });
UserEmailAccountSchema.index({ isActive: 1, 'syncState.nextAllowedSyncAt': 1 });
UserEmailAccountSchema.index({ 'pushState.graphSubscriptionId': 1 });
