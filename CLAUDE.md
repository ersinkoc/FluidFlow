# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FluidFlow is a sketch-to-app prototyping tool that converts wireframes/sketches into functional React applications using AI. It features multi-provider AI support, live preview with device simulation, Git integration, and IndexedDB-based WIP persistence.

## Development Commands

```bash
# Prerequisites: Node.js 20+ (LTS)
npm install                  # Install dependencies
npm run dev                  # Start frontend (port 3100) + backend (port 3200)

# Individual servers
npm run dev:frontend         # Vite dev server (HTTPS required for WebContainer API)
npm run dev:server           # Express backend only

# Code quality
npm run type-check           # TypeScript checking (tsc --noEmit)
npm run lint                 # ESLint with zero warnings tolerance
npm run lint:fix             # Auto-fix ESLint issues
npm run format               # Prettier formatting

# Testing (Vitest)
npm test                     # Watch mode
npm run test:run             # Single run (CI)
npm run test:coverage        # With coverage report
npm test -- path/to/test.ts  # Run specific file
npm test -- --grep "pattern" # Filter by test name
npm run test:security        # Security tests only
```

## Environment Setup

Create `.env.local` in project root:
```env
GEMINI_API_KEY=your_key      # At least one provider key required
# Optional: OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, ZAI_API_KEY
```

## Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4 (port 3100, HTTPS)
- **Backend**: Express 5, tsx (port 3200)
- **Editor**: Monaco Editor
- **Testing**: Vitest 4 with jsdom

### Directory Structure
```
server/           # Express API endpoints
  api/            # projects.ts, git.ts, github.ts, settings.ts, runner.ts
  middleware/     # security.ts (request validation)
  utils/          # encryption.ts, validation.ts, safeJson.ts
services/
  ai/             # Multi-provider abstraction
    providers/    # gemini.ts, openai.ts, anthropic.ts, zai.ts, ollama.ts, lmstudio.ts
    utils/        # streamParser.ts, errorHandling.ts, retry.ts, schemas.ts
  conversationContext.ts  # Token tracking and AI compaction
  wipStorage.ts   # IndexedDB persistence for uncommitted changes
  projectApi.ts   # Backend API client
contexts/
  AppContext.tsx  # Centralized state management (files, projects, git, UI)
components/
  ControlPanel/   # Left sidebar (chat, settings, project management)
  PreviewPanel/   # Right panel (editor, console, preview, git)
  GitPanel/       # Git operations UI
  ContextIndicator/  # Token usage display
  MegaSettingsModal/ # Settings panels
hooks/            # useProject, useVersionHistory, useCodeGeneration, useAutoFix, etc.
utils/            # cleanCode, validation, safeJson, codemap
types/            # TypeScript definitions
tests/            # Unit, integration, security tests
projects/         # Local project storage (gitignored, auto-generated)
```

### Core Data Flow
```
User Input → ControlPanel.handleSend() → AI Provider (streaming)
    → Parse Response → DiffModal (review changes)
    → Confirm → Update files state → Save to filesystem
    → PreviewPanel renders via iframe
```

### Key Patterns

**Virtual File System**: Projects stored as `Record<string, string>` in `projects/[id]/files/`. Uncommitted changes (WIP) persist in IndexedDB for page refresh resilience.

**AI Provider Architecture** (`services/ai/index.ts`):
- `ProviderManager` class with factory pattern
- Providers: gemini, openai, openrouter, anthropic, zai, ollama, lmstudio, custom
- Methods: `generate()`, `generateStream()` with streaming callbacks
- Config persisted in localStorage + backend sync

**Context Management** (`services/conversationContext.ts`):
- Separate contexts: `main-chat`, `prompt-improver`, `git-commit`, `quick-edit`
- Token estimation: ~4 characters = 1 token
- Auto-compaction: AI summarizes old messages when approaching model limits

**State Management**: Centralized in `contexts/AppContext.tsx` (used by `App.tsx`):
- `files` - Virtual file system
- `currentProject` - Project metadata
- `gitStatus` - Repository state
- `pendingReview` - DiffModal state for change review
- History/undo-redo via `useVersionHistory` hook

**Preview System**:
- Iframe-based with Babel transpilation in browser
- Console/network interception via postMessage
- Device simulation (desktop, tablet, mobile)
- HTTPS required for WebContainer API (configured via `@vitejs/plugin-basic-ssl`)

### Vite Dev Server Notes
- HTTPS enabled with self-signed cert for WebContainer API
- Cross-Origin headers: `Cross-Origin-Embedder-Policy: credentialless`
- API proxy: `/api` → `http://localhost:3200`
- Watch ignores: `projects/**`, `node_modules/**`, `.git/**`

## Path Aliases

```typescript
'@/*' → project root  // Used in imports: @/components, @/utils, etc.
```

Additional test aliases in `vitest.config.ts`: `@utils`, `@components`, `@services`, `@hooks`, `@types`, `@server`

## Code Quality

### ESLint (`eslint.config.js` - flat config, ESLint 9)
- TypeScript strict with `typescript-eslint`
- React hooks rules enforced
- Unused vars allowed with `_` prefix pattern
- Server files (`server/**`): console.log allowed
- Test files: `no-explicit-any` disabled

Key rules: `eqeqeq: always`, `prefer-const`, `no-var`

### Testing
- Framework: Vitest with jsdom environment
- Setup: `tests/setup.ts`
- Security tests in `tests/security/` cover XSS, path traversal, SQL injection patterns

## Critical Files

These files require understanding multiple parts of the codebase:

| File | Purpose |
|------|---------|
| `contexts/AppContext.tsx` | Centralized state: files, projects, git, UI, history |
| `App.tsx` | Main orchestrator, modal management, DiffModal |
| `services/ai/index.ts` | ProviderManager, provider factory, config persistence |
| `services/conversationContext.ts` | Token tracking, context compaction logic |
| `services/wipStorage.ts` | IndexedDB persistence for WIP changes |
| `utils/cleanCode.ts` | AI response parsing, code extraction |
| `utils/validation.ts` | Security: XSS prevention, path traversal checks |
| `server/api/projects.ts` | Project CRUD, file management |
| `hooks/useProject.ts` | Project state, git integration, GitHub push |
| `components/ControlPanel/index.tsx` | AI call orchestration, message handling |
