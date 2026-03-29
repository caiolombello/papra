export type PapraDocument = {
  id: string;
  name: string;
  mimeType: string;
  originalName: string;
  originalSize: number;
  originalStorageKey: string;
  originalSha256Hash: string;
  organizationId: string;
  createdBy: string;
  deletedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  isDeleted: boolean;
  content: string;
};

export type PapraMeetingChunk = {
  id: string;
  meetingId: string;
  organizationId: string;
  chunkIndex: number;
  speaker: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type PapraMeetingSearchMatch = {
  chunkId: string;
  speaker: string | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  content: string;
  snippet: string;
};

export type PapraMeeting = {
  id: string;
  organizationId: string;
  createdBy: string | null;
  title: string;
  sourceName: string | null;
  sourceStorageKey: string | null;
  transcriptStorageKey: string | null;
  rawTranscriptStorageKey: string | null;
  language: string | null;
  context: string | null;
  summary: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  chunks?: PapraMeetingChunk[];
  matches?: PapraMeetingSearchMatch[];
};

export type PapraMeetingForCreation = {
  title: string;
  sourceName?: string;
  sourceStorageKey?: string;
  transcriptStorageKey?: string;
  rawTranscriptStorageKey?: string;
  language?: string;
  context?: string;
  summary?: string;
  startedAt?: string | Date;
  endedAt?: string | Date;
  chunks: Array<{
    speaker?: string;
    startedAtMs?: number;
    endedAtMs?: number;
    content: string;
  }>;
};

export type PapraMeetingForUpdate = {
  title?: string;
  sourceName?: string;
  sourceStorageKey?: string;
  transcriptStorageKey?: string;
  rawTranscriptStorageKey?: string;
  language?: string;
  context?: string;
  summary?: string;
  startedAt?: string | Date;
  endedAt?: string | Date;
};

export type PapraMeetingForIngestion = PapraMeetingForCreation & {
  sourceStorageKey: string;
};

export type PapraUnifiedSearchScope = 'all' | 'documents' | 'meetings';

export type PapraUnifiedSearchResult = {
  scope: PapraUnifiedSearchScope;
  documents: PapraDocument[];
  documentsCount: number;
  meetings: PapraMeeting[];
  meetingsCount: number;
  totalCount: number;
};

export type PapraCustomPropertyType =
  | 'text'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multi_select'
  | 'user_relation'
  | 'document_relation';

export type PapraCustomPropertySelectOption = {
  id: string;
  name: string;
  key: string;
  displayOrder: number;
};

export type PapraCustomPropertyDefinition = {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  description?: string | null;
  type: PapraCustomPropertyType;
  displayOrder: number;
  options: PapraCustomPropertySelectOption[];
  createdAt: string;
  updatedAt: string;
};

export type PapraDocumentCustomProperty = {
  key: string;
  name: string;
  type: PapraCustomPropertyType;
  displayOrder: number;
  value: unknown;
};

export type PapraTag = {
  id: string;
  name: string;
  color: string;
  description?: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};

export type PapraTaggingRuleCondition = {
  field: 'name' | 'content';
  operator: 'equal' | 'not_equal' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with';
  value: string;
};

export type PapraTaggingRuleForCreation = {
  name: string;
  description?: string;
  enabled?: boolean;
  conditionMatchMode?: 'all' | 'any';
  conditions: PapraTaggingRuleCondition[];
  tagIds: string[];
};

export type PapraTaggingRule = {
  id: string;
  name: string;
  description: string;
  conditionMatchMode?: 'all' | 'any';
  conditions: PapraTaggingRuleCondition[];
  actions: { tagId: string }[];
  organizationId: string;
  createdAt: string;
  updatedAt: string;
};
