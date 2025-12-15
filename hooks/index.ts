/**
 * Hooks Index
 *
 * Barrel export for all custom hooks.
 * Provides a single import point for hook consumers.
 */

// Project management hooks (extracted from useProject)
export { useServerHealth } from './useServerHealth';
export type { ServerHealthState, UseServerHealthReturn } from './useServerHealth';

export { useContextPersistence } from './useContextPersistence';
export type { UseContextPersistenceReturn } from './useContextPersistence';

export { useGitOperations } from './useGitOperations';
export type { GitOperationsState, UseGitOperationsReturn } from './useGitOperations';

export { useSyncOperations } from './useSyncOperations';
export type {
  PendingSyncConfirmation,
  SyncOperationsState,
  UseSyncOperationsReturn,
} from './useSyncOperations';

export { useProjectManagement, projectStorage } from './useProjectManagement';
export type {
  ProjectManagementState,
  UseProjectManagementReturn,
  ProjectContext,
  HistoryEntry,
} from './useProjectManagement';

// Main composite hook (uses the above hooks)
export { useProject } from './useProject';
export type { ProjectState, UseProjectReturn } from './useProject';

// UI state hooks
export { useModalManager, createModalProps, LEGACY_STATE_MAPPING } from './useModalManager';
export type { ModalType, ModalState, ModalManager } from './useModalManager';

// AI Generation state hook
export { useGenerationState } from './useGenerationState';
export type {
  GenerationMeta,
  FilePlan,
  TruncatedContent,
  ContinuationState,
  UseGenerationStateReturn,
} from './useGenerationState';

// Auto-fix hook
export { useAutoFix } from './useAutoFix';

// Continuation generation hook
export { useContinuationGeneration } from './useContinuationGeneration';
export type {
  ContinuationGenerationOptions,
  UseContinuationGenerationReturn,
} from './useContinuationGeneration';

// Inspect edit hook
export { useInspectEdit } from './useInspectEdit';
export type {
  InspectContext,
  UseInspectEditOptions,
  UseInspectEditReturn,
} from './useInspectEdit';

// Code generation hook (main generation logic)
export { useCodeGeneration } from './useCodeGeneration';
export type {
  CodeGenerationOptions,
  CodeGenerationResult,
  AIHistoryEntry,
  UseCodeGenerationOptions,
  UseCodeGenerationReturn,
} from './useCodeGeneration';

// Streaming response hook (extracted from useCodeGeneration)
export { useStreamingResponse, parseFilePlanFromStream } from './useStreamingResponse';
export type {
  StreamingCallbacks,
  StreamingResult,
  UseStreamingResponseReturn,
} from './useStreamingResponse';

// Response parser hook (extracted from useCodeGeneration)
export { useResponseParser } from './useResponseParser';
export type {
  StandardParseResult,
  SearchReplaceParseResult,
  UseResponseParserOptions,
  UseResponseParserReturn,
} from './useResponseParser';

// Other hooks
export { useVersionHistory } from './useVersionHistory';
export { useDebugStore } from './useDebugStore';
