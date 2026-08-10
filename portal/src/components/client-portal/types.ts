export type PortalPayment = {
  _id: string;
  title: string;
  dueDate: string;
  amount?: number;
  status: string;
};

export type ClientPortalNeed = {
  _id: string;
  category: string;
  status: string;
  title: string;
  description?: string;
  dueDate?: string;
  satisfiedDocUrl?: string;
  satisfiedAt?: string;
};

export type DeliveryBoardColumn = {
  name: string;
  count: number;
};

export type PortalDeliveryBoard = {
  name: string;
  key: string;
  totalIssues: number;
  columns: DeliveryBoardColumn[];
};

export type PortalUpdateItem = {
  _id: string;
  title: string;
  body: string;
  cadence: 'daily' | 'weekly' | 'general';
  createdAt?: string | null;
  createdByName?: string;
};

export type PortalDeal = {
  _id?: string;
  title?: string;
  stage?: string;
  status?: string;
  currency?: string;
  dealValue?: number;
  expectedDealValue?: number;
  createdAt?: string;
  expectedClosureDate?: string;
  nextStep?: string;
  portalScopeSummary?: string;
  organization?: { name?: string };
  portalDocuments?: { name: string; url: string; uploadedBy?: string; type: 'admin_provided' | 'client_uploaded'; satisfiedNeedId?: string; createdAt: string }[];
  portalMilestones?: { label: string; status: 'pending' | 'in-progress' | 'completed'; percentage: number }[];
  portalDeadlines?: { label: string; date: string }[];
};

export type PortalPayload = {
  deal: PortalDeal;
  payments?: PortalPayment[];
  clientNeeds?: ClientPortalNeed[];
  deliveryBoard?: PortalDeliveryBoard | null;
  updates?: PortalUpdateItem[];
};
