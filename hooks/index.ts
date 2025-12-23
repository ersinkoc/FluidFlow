/**
 * Hooks Index
 *
 * Barrel export for all custom hooks.
 * Provides a single import point for hook consumers.
 */

// Main project hook (includes CRUD, sync, git operations)
export { useProject } from './useProject';
export type { ProjectState, UseProjectReturn, PendingSyncConfirmation } from './useProject';

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

// Speech recognition hook
export { useSpeechRecognition } from './useSpeechRecognition';

// Preview AI hook
export { usePreviewAI } from './usePreviewAI';

// Export hook
export { useExport } from './useExport';

// Log stream hook
export { useLogStream } from './useLogStream';
export type { LogEntry } from './useLogStream';

// Tech stack hook
export { useTechStack } from './useTechStack';
