export type PlaybookSectionType = "script" | "checklist" | "qa" | "notes";

export type PlaybookRunnerAnswerType = "text" | "dropdown" | "checkbox";

export interface PlaybookSectionForm {
  id: string;
  type: PlaybookSectionType;
  order: number;
  title: string;
  html: string;
}

export interface PlaybookRunnerQuestionForm {
  id: string;
  order: number;
  prompt: string;
  answerType: PlaybookRunnerAnswerType;
  options: string[];
  crmTarget: "Deal" | "Contact" | "Lead";
  crmFieldPath: string;
}

export type PlaybookEmailEngagement =
  | "has_tracked_send"
  | "opened"
  | "not_opened"
  | "never_sent";

export interface PlaybookRecommendationTriggerForm {
  recordType: "Deal" | "Contact" | "Lead";
  /** Default / omitted = compare CRM field */
  triggerKind?: "field" | "email_engagement";
  emailEngagement?: PlaybookEmailEngagement;
  fieldPath: string;
  operator: "eq" | "in";
  values: string[];
}

export interface PlaybookApi {
  _id: string;
  name: string;
  description?: string;
  content?: string;
  appliesTo: string;
  status?: string;
  category?: string;
  team?: string;
  salesStages?: string[];
  archived?: boolean;
  sections?: PlaybookSectionForm[];
  runnerQuestions?: PlaybookRunnerQuestionForm[];
  recommendationTrigger?: PlaybookRecommendationTriggerForm | null;
  isActive: boolean;
  updatedAt: string;
}
