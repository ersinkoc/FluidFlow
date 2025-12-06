# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FluidFlow is a sketch-to-app prototyping tool that uses Google's Gemini AI to convert wireframes/sketches into functional React applications. It features a glassmorphism UI and provides real-time preview of generated apps.

## Development Commands

```bash
npm install     # Install dependencies
npm run dev     # Start development server on port 3100
npm run build   # Build for production
npm run preview # Preview production build
```

## Environment Setup

Create a `.env.local` file with:
```
GEMINI_API_KEY=your_gemini_api_key
```

## Architecture

### File Structure
- `index.tsx` - React entry point (mounts App to root)
- `App.tsx` - Main application component containing:
  - `DiffModal` component for reviewing file changes
  - State management for files, history, and diff review
  - `FileSystem` type: `Record<string, string>` mapping file paths to content
- `components/ControlPanel.tsx` - Left sidebar with:
  - File explorer (virtual project files)
  - Sketch/brand image upload with drag-and-drop
  - Prompt input with voice recognition
  - Engineer/Consultant mode toggle
  - History timeline with revert functionality
- `components/PreviewPanel.tsx` - Right panel with:
  - Live iframe preview with device simulation (desktop/tablet/mobile)
  - Code editor for generated files
  - AI-powered features: accessibility audit, responsiveness fix, quick edit
  - DevTools console/network panel
  - StackBlitz and GitHub export

### Key Patterns

**Virtual File System**: The app manages a virtual file system (`FileSystem` type) that stores generated React project files in memory. Files are organized with `src/`, `db/`, and root prefixes.

**AI Generation Flow**:
1. User uploads sketch → `ControlPanel.handleGenerate()`
2. Gemini API generates multi-file React project as JSON
3. Changes go through `reviewChange()` → `DiffModal` for user approval
4. Approved changes update state via `confirmChange()` and add to history

**Preview Rendering**: The `PreviewPanel` creates an HTML document with:
- Tailwind CSS via CDN
- Babel in-browser transpilation
- Custom import resolution for virtual files
- Console/error interception via postMessage

### State Flow
- `files` state in `App.tsx` is the source of truth for all virtual project files
- History entries store snapshots of the entire `FileSystem`
- All destructive changes go through the diff review modal

## Dependencies

- React 19 with TypeScript
- Vite for bundling
- `@google/genai` for Gemini AI integration
- `lucide-react` for icons
- `diff` for file comparison in review modal
- `@stackblitz/sdk` for StackBlitz export

## Path Aliases

`@/*` maps to project root (configured in tsconfig.json and vite.config.ts)
