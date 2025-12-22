/**
 * Token Usage Types
 */

export interface UsageSnapshot {
  timestamp: number;
  tokens: number;
  messages: number;
}

export interface UsageData {
  contextId: string;
  snapshots: UsageSnapshot[];
  currentTokens: number;
  maxTokens: number;
}

export interface UsageGraphProps {
  data: UsageData;
  height?: number;
  showLabels?: boolean;
  className?: string;
}
