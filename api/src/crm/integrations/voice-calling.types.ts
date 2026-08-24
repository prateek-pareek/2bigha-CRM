export const VOICE_CALLING_INTEGRATION_TYPE = 'voice-calling';

export type VoiceProviderId = 'twilio' | 'readymode' | 'elevenlabs' | 'kommuno';

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

/**
 * Kommuno (kommuno.in) — Indian cloud telephony provider.
 *
 * TODO: Kommuno's API docs/credentials haven't been shared yet. The fields
 * below are a best-guess shape modeled on the Readymode/Twilio configs
 * (generic click-to-call: API key + endpoint + caller ID, optional agent
 * bridge). Update field names, the request payload in
 * `callViaKommuno` (voice-calling.service.ts), and `isProviderConfigured`
 * once Kommuno sends their actual API reference.
 */
export type KommunoVoiceConfig = {
  enabled?: boolean;
  /** Kommuno API key / auth token */
  apiKey?: string;
  /** Click-to-call / outbound API endpoint provided by Kommuno for this account */
  apiUrl?: string;
  /** Virtual/toll-free number registered with Kommuno, shown as caller ID */
  callerId?: string;
  /**
   * Optional agent phone for click-to-call: Kommuno rings the agent first,
   * then bridges to the lead (mirrors Twilio's agentPhone behavior). Leave
   * blank if Kommuno should dial the lead directly.
   */
  agentPhone?: string;
};

export type VoiceCallingConfig = {
  activeProvider: VoiceProviderId;
  providers: {
    twilio: TwilioVoiceConfig;
    readymode: ReadymodeVoiceConfig;
    elevenlabs: ElevenLabsVoiceConfig;
    kommuno: KommunoVoiceConfig;
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
    kommuno: { enabled: false, apiUrl: '' },
  },
};

export type InitiateVoiceCallDto = {
  toNumber: string;
  relatedTo?: string;
  relatedType?: 'Lead' | 'Contact' | 'Organization' | 'Client';
  leadName?: string;
  /** Optional override; defaults to activeProvider */
  provider?: VoiceProviderId;
};
