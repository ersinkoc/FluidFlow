/**
 * FluidFlow Default Configuration
 *
 * Default values for FluidFlow project configuration.
 */

import type { FluidFlowConfig, ContextSettings } from './types';

/**
 * Default project rules template
 */
export const DEFAULT_RULES = `# FluidFlow Project Rules

## Code Style
- Use TypeScript with strict mode
- Follow React best practices
- Use Tailwind CSS for styling
- Prefer functional components with hooks

## Generation Guidelines
- Always include proper error handling
- Add loading states for async operations
- Make components responsive by default
- Include accessibility attributes (ARIA)

## File Structure
- Components in src/components/
- Utilities in src/utils/
- Types in src/types/
`;

/**
 * Default agent configurations
 */
export const DEFAULT_AGENTS = [
  {
    id: 'prompt-engineer',
    name: 'Prompt Engineer',
    description: 'Helps improve prompts through conversation',
    systemPrompt: 'You are a prompt engineering expert...',
    enabled: true,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews generated code for best practices',
    systemPrompt: 'You are a senior code reviewer...',
    enabled: false,
  },
  {
    id: 'accessibility-auditor',
    name: 'Accessibility Auditor',
    description: 'Checks code for accessibility issues',
    systemPrompt: 'You are an accessibility expert...',
    enabled: false,
  },
];

/**
 * Default context settings
 * minRemainingTokens: Trigger compaction when remaining context space falls below this value
 * This ensures we always have room for the AI to generate a meaningful response
 */
export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  minRemainingTokens: 8000, // Compact when less than 8K tokens remaining
  compactToTokens: 2000,
  autoCompact: false, // Require confirmation
  saveCompactionLogs: true,
};

/**
 * Default FluidFlow configuration
 */
export const DEFAULT_CONFIG: FluidFlowConfig = {
  rules: DEFAULT_RULES,
  agents: DEFAULT_AGENTS,
  contextSettings: DEFAULT_CONTEXT_SETTINGS,
};

/**
 * Storage keys for localStorage persistence
 */
export const STORAGE_KEYS = {
  CONFIG: 'fluidflow_config',
  COMPACTION_LOGS: 'fluidflow_compaction_logs',
} as const;

/**
 * Maximum number of compaction logs to retain
 */
export const MAX_COMPACTION_LOGS = 50;
