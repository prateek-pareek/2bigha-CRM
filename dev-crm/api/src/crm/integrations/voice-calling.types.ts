export const VOICE_CALLING_INTEGRATION_TYPE = 'voice-calling';

export type VoiceProviderId = 'twilio' | 'readymode' | 'elevenlabs';

export type TwilioVoiceConfig = {
  enabled?: boolean;
  accountSid?: string;
  authToken?: string;
  /** E.164 Twilio caller ID / purchased number */
  fromNumber?: string;
  /**
   * Optional agent phone for click-to-call:
   * Twilio rings the agent first, then bridges to the lead.
   */
  agentPhone?: string;
};

export type ReadymodeVoiceConfig = {
  enabled?: boolean;
  /** Readymode API key or auth token */
  apiKey?: string;
  /**
   * Click-to-call / outbound API endpoint
   * (from Readymode or your middleware), e.g. https://api.readymode.com/...
   */
  apiUrl?: string;
  campaignId?: string;
  /** Optional extra headers as JSON object string keys */
  authHeaderName?: string;
};

export type ElevenLabsVoiceConfig = {
  enabled?: boolean;
  apiKey?: string;
  agentId?: string;
  /** ElevenLabs phone number id (Twilio-linked in ElevenLabs dashboard) */
  agentPhoneNumberId?: string;
};

export type VoiceCallingConfig = {
  activeProvider: VoiceProviderId;
  providers: {
    twilio: TwilioVoiceConfig;
    readymode: ReadymodeVoiceConfig;
    elevenlabs: ElevenLabsVoiceConfig;
  };
};

export const DEFAULT_VOICE_CALLING_CONFIG: VoiceCallingConfig = {
  activeProvider: 'twilio',
  providers: {
    twilio: { enabled: false },
    readymode: {
      enabled: false,
      authHeaderName: 'Authorization',
      apiUrl: '',
    },
    elevenlabs: { enabled: false },
  },
};

export type InitiateVoiceCallDto = {
  toNumber: string;
  relatedTo?: string;
  relatedType?: 'Lead' | 'Contact' | 'Deal' | 'Organization' | 'Client';
  leadName?: string;
  /** Optional override; defaults to activeProvider */
  provider?: VoiceProviderId;
};
