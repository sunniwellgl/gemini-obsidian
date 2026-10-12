export interface DistillPayload {
  concept_name: string;
  category: '30-Engineering' | '40-Mathematics' | '20-Projects';
  target_subfolder?: string;
  title: string;
  domain: string;
  tags: string[];
  physical_entry: string[];

  // 四大支柱提炼内容
  pillars: {
    physical_context: string;
    symptom: string;
    ground_truth_root_cause: string;
    implicit_contract: string;
    preventative_safeguard: string;
    mermaid_diagram?: string;
    latex_formulation?: string;
    code_demonstration?: {
      language: string;
      before?: string;
      after: string;
    };
  };

  // 原始来源追踪
  provenance: {
    source_file: string;
    source_heading?: string;
    raw_snippet: string;
  };
}

export interface RagCandidate {
  file_path: string;
  score: number;
  matched_chunk: string;
}

export type DistillDecisionType = 'subsume' | 'crystallize';

export interface DistillDecision {
  type: DistillDecisionType;
  target_file_path: string;
  target_heading?: string;
  confidence: number;
  reasoning: string;
}

export interface DistilledMarker {
  target: string;
  anchor?: string;
  timestamp?: string;
  rawMatch: string;
}

export interface Segment {
  id: string;
  heading?: string;
  rawText: string;
  isDistilled: boolean;
  marker?: DistilledMarker;
  startLine: number;
  endLine: number;
}

export interface DistillOptions {
  vaultPath: string;
  filePath: string;
  dryRun?: boolean;
  force?: boolean;
  target?: string;
  isNew?: boolean;
  section?: string;
  thresholdHigh?: number; // 默认 0.82
  thresholdLow?: number;  // 默认 0.65
  payloads?: DistillPayload[];
  extractor?: (rawText: string, context: { sourceFile: string; heading?: string }) => Promise<DistillPayload[]>;
  ragQuery?: (query: string, limit?: number) => Promise<RagCandidate[]>;
  ragIndex?: (filePath: string) => Promise<void>;
}

export interface DistillResult {
  action: 'crystallize' | 'subsume' | 'skipped' | 'dry-run';
  processedCount: number;
  skippedCount: number;
  createdFiles: string[];
  updatedFiles: string[];
  payloads: DistillPayload[];
  decisions: DistillDecision[];
}
