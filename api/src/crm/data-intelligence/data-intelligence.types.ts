export type DataIntelligenceUserContext = {
  email: string;
  displayName: string;
  isWorkspaceAdmin: boolean;
  effectiveOwner: string;
  permissions: string[];
};

export type DataIntelligenceQueryResult = {
  answer: string;
  toolsUsed: string[];
  model: string;
};

export type AnthropicToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};
