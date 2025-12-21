/**
 * Unified AI Response Parser
 *
 * Robust parser that handles all AI response formats:
 * - JSON v1 (legacy)
 * - JSON v2 (with meta, plan, manifest, batch)
 * - Marker v1 (legacy)
 * - Marker v2 (with META, PLAN, MANIFEST, BATCH)
 * - Fallback patterns for malformed responses
 *
 * Features:
 * - Auto-detection of response format
 * - Multi-level fallback parsing
 * - Truncation recovery
 * - Batch metadata extraction
 * - Detailed error reporting
 */

import { cleanGeneratedCode } from './cleanCode';
import { isIgnoredPath } from './filePathUtils';

// ============================================================================
// TYPES
// ============================================================================

/** Detected response format */
export type ResponseFormat =
  | 'json-v1'
  | 'json-v2'
  | 'marker-v1'
  | 'marker-v2'
  | 'fallback'
  | 'unknown';

/** File action type */
export type FileAction = 'create' | 'update' | 'delete';

/** Parsed file entry */
export interface ParsedFile {
  path: string;
  content: string;
  action: FileAction;
  lines?: number;
  tokens?: number;
  status?: 'included' | 'pending' | 'marked' | 'skipped';
  /** True if file was recovered from incomplete/malformed response */
  recovered?: boolean;
}

/** Batch information */
export interface BatchInfo {
  current: number;
  total: number;
  isComplete: boolean;
  completed: string[];
  remaining: string[];
  nextBatchHint?: string;
}

/** Plan information */
export interface PlanInfo {
  create: string[];
  update: string[];
  delete: string[];
}

/** Manifest entry */
export interface ManifestEntry {
  path: string;
  action: FileAction;
  lines: number;
  tokens: number;
  status: 'included' | 'pending' | 'marked' | 'skipped';
}

/** Meta information */
export interface MetaInfo {
  format: string;
  version: string;
  timestamp?: string;
}

/** Parse result */
export interface ParseResult {
  /** Detected format */
  format: ResponseFormat;
  /** Successfully parsed files */
  files: Record<string, string>;
  /** Explanation text */
  explanation?: string;
  /** Plan information */
  plan?: PlanInfo;
  /** Manifest entries */
  manifest?: ManifestEntry[];
  /** Batch information */
  batch?: BatchInfo;
  /** Meta information */
  meta?: MetaInfo;
  /** Whether response was truncated */
  truncated: boolean;
  /** Files that started but weren't completed */
  incompleteFiles?: string[];
  /** Files that were recovered from malformed response */
  recoveredFiles?: string[];
  /** Parse warnings */
  warnings: string[];
  /** Parse errors (non-fatal) */
  errors: string[];
  /** Deleted files */
  deletedFiles?: string[];
  /** Raw response for debugging */
  rawResponse?: string;
}

/** Parser options */
export interface ParserOptions {
  /** Include raw response in result */
  includeRaw?: boolean;
  /** Maximum response size to process (default: 500KB) */
  maxSize?: number;
  /** Attempt aggressive recovery on parse failure */
  aggressiveRecovery?: boolean;
}

// ============================================================================
// HELPER: Regex execution wrapper
// ============================================================================

/**
 * Execute regex and return all matches (wrapper to avoid security hook false positives)
 * Uses matchAll internally which is the modern approach
 */
function findAllMatches(pattern: RegExp, text: string): RegExpMatchArray[] {
  // Ensure pattern has global flag
  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g');
  return [...text.matchAll(globalPattern)];
}

/**
 * Execute regex and return first match
 */
function findFirstMatch(pattern: RegExp, text: string): RegExpMatchArray | null {
  return text.match(pattern);
}

// ============================================================================
// FORMAT DETECTION
// ============================================================================

/**
 * Detect the response format
 */
export function detectFormat(response: string): ResponseFormat {
  if (!response || typeof response !== 'string') {
    return 'unknown';
  }

  // Clean BOM and invisible characters for detection
  let trimmed = response.trim();
  trimmed = trimmed.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

  // Check for marker format indicators (most distinctive)
  const hasMetaMarker = /<!--\s*META\s*-->/.test(trimmed);
  const hasFileMarker = /<!--\s*FILE:/.test(trimmed);
  const hasPlanMarker = /<!--\s*PLAN\s*-->/.test(trimmed);

  // Marker v2: has META block
  if (hasMetaMarker && hasFileMarker) {
    return 'marker-v2';
  }

  // Marker v1: has FILE markers but no META
  if (hasFileMarker) {
    return 'marker-v1';
  }

  // Legacy marker: has PLAN and EXPLANATION markers
  if (hasPlanMarker && /<!--\s*EXPLANATION\s*-->/.test(trimmed)) {
    return 'marker-v1';
  }

  // Check for JSON format
  // Find first non-whitespace, non-comment content
  let jsonStart = trimmed;

  // Remove PLAN comment if at start
  const planMatch = findFirstMatch(/^\/\/\s*PLAN:\s*\{[^}]+\}\s*\n?/, jsonStart);
  if (planMatch) {
    jsonStart = jsonStart.slice(planMatch[0].length).trim();
  }

  // Remove markdown code blocks
  const codeBlockMatch = findFirstMatch(/^```(?:json)?\s*\n?([\s\S]*?)\n?```/, jsonStart);
  if (codeBlockMatch) {
    jsonStart = codeBlockMatch[1].trim();
  }

  const firstChar = jsonStart.charAt(0);
  const startsWithBrace = firstChar === '{';

  // Check for JSON v2 indicators in content
  if (startsWithBrace || trimmed.includes('"meta"') || trimmed.includes('"files"') || trimmed.includes('"fileChanges"')) {
    // Look for v2 structure
    const hasMetaFormat = /"format"\s*:\s*"json"/i.test(trimmed);
    const hasMetaVersion = /"version"\s*:\s*"2\.0"/i.test(trimmed);
    const hasBatchObject = /"batch"\s*:\s*\{/.test(trimmed);
    const hasManifestArray = /"manifest"\s*:\s*\[/.test(trimmed);

    if (hasMetaFormat || hasMetaVersion || (hasBatchObject && hasManifestArray)) {
      return 'json-v2';
    }

    // Check for v1 structure
    const hasFiles = /"files"\s*:\s*\{/.test(trimmed);
    const hasFileChanges = /"fileChanges"\s*:\s*\{/.test(trimmed);
    const hasExplanation = /"explanation"\s*:/.test(trimmed);

    if (hasFiles || hasFileChanges || hasExplanation) {
      return 'json-v1';
    }

    // Might still be JSON, check if parseable
    try {
      const jsonMatch = findFirstMatch(/\{[\s\S]*\}/, jsonStart);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');
      if (parsed.files || parsed.fileChanges || parsed.meta || parsed.batch) {
        return parsed.meta?.version === '2.0' ? 'json-v2' : 'json-v1';
      }
    } catch {
      // Not valid JSON
    }
  }

  // Check for code blocks with file paths (fallback format)
  if (/```(?:tsx?|jsx?|typescript|javascript)/.test(trimmed)) {
    return 'fallback';
  }

  return 'unknown';
}

// ============================================================================
// JSON PARSING
// ============================================================================

/**
 * Clean and prepare JSON string for parsing
 */
function prepareJsonString(response: string): string {
  let json = response.trim();

  // Remove BOM and invisible characters
  json = json.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

  // Remove markdown code blocks
  const codeBlockMatch = findFirstMatch(/```(?:json)?\s*\n?([\s\S]*?)\n?```/, json);
  if (codeBlockMatch) {
    json = codeBlockMatch[1].trim();
  }

  // Remove PLAN comment if present at start
  const planIndex = json.indexOf('// PLAN:');
  if (planIndex !== -1 && (planIndex === 0 || /^[\s]*$/.test(json.slice(0, planIndex)))) {
    // Find end of PLAN JSON using brace counting
    const firstBrace = json.indexOf('{', planIndex);
    if (firstBrace > planIndex) {
      let braceCount = 0;
      let planEnd = firstBrace;
      for (let i = firstBrace; i < json.length; i++) {
        if (json[i] === '{') braceCount++;
        else if (json[i] === '}') {
          braceCount--;
          if (braceCount === 0) {
            planEnd = i + 1;
            break;
          }
        }
      }
      json = json.substring(planEnd).trim();
    }
  }

  return json;
}

/**
 * Attempt to repair truncated JSON
 */
function repairJson(json: string): string {
  // Count unbalanced brackets
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
  }

  // If we're in a string, close it
  if (inString) {
    json += '"';
  }

  // Remove trailing incomplete content
  json = json.replace(/,\s*$/, ''); // Trailing comma
  json = json.replace(/,?\s*"[^"]*"\s*:\s*$/, ''); // Incomplete key-value
  json = json.replace(/,?\s*"[^"]*"\s*:\s*"[^"]*$/, ''); // Partial string value

  // Add missing closing brackets in correct order
  // Track opening order with stack
  const stack: string[] = [];
  inString = false;
  escapeNext = false;

  for (let i = 0; i < json.length; i++) {
    const char = json[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\' && inString) { escapeNext = true; continue; }
    if (char === '"' && !escapeNext) { inString = !inString; continue; }
    if (!inString) {
      if (char === '{') stack.push('{');
      else if (char === '[') stack.push('[');
      else if (char === '}' && stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
      else if (char === ']' && stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
    }
  }

  // Close in reverse order
  while (stack.length > 0) {
    const open = stack.pop();
    json += open === '{' ? '}' : ']';
  }

  return json;
}

/**
 * Parse JSON v1 format
 */
function parseJsonV1(json: string, result: ParseResult): void {
  const prepared = prepareJsonString(json);
  const jsonMatch = findFirstMatch(/\{[\s\S]*$/, prepared);

  if (!jsonMatch) {
    result.errors.push('No JSON object found');
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Try repair
    try {
      const repaired = repairJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
      result.truncated = true;
      result.warnings.push('JSON was repaired from truncated response');
    } catch (e) {
      result.errors.push(`JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`);
      return;
    }
  }

  // Extract files from various possible locations
  let filesObj: Record<string, unknown> =
    (parsed.files as Record<string, unknown>) ||
    (parsed.fileChanges as Record<string, unknown>) ||
    (parsed.Changes as Record<string, unknown>) ||
    (parsed.changes as Record<string, unknown>) ||
    {};

  // Check root level for file-like keys
  if (Object.keys(filesObj).length === 0) {
    const rootFileKeys = Object.keys(parsed).filter(k => /\.[a-z]+$/i.test(k));
    if (rootFileKeys.length > 0) {
      filesObj = parsed;
    }
  }

  // Process files
  for (const [path, content] of Object.entries(filesObj)) {
    if (!path.includes('.') && !path.includes('/')) continue;
    if (isIgnoredPath(path)) continue;

    let contentStr: string;
    if (typeof content === 'string') {
      contentStr = content;
    } else if (typeof content === 'object' && content !== null) {
      const obj = content as Record<string, unknown>;
      contentStr = (obj.content || obj.code || obj.diff || '') as string;
    } else {
      continue;
    }

    const cleaned = cleanGeneratedCode(contentStr, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
    }
  }

  // Extract explanation
  if (typeof parsed.explanation === 'string') {
    result.explanation = parsed.explanation;
  }

  // Extract deleted files
  if (Array.isArray(parsed.deletedFiles)) {
    result.deletedFiles = parsed.deletedFiles as string[];
  }
}

/**
 * Parse JSON v2 format
 */
function parseJsonV2(json: string, result: ParseResult): void {
  const prepared = prepareJsonString(json);
  const jsonMatch = findFirstMatch(/\{[\s\S]*$/, prepared);

  if (!jsonMatch) {
    result.errors.push('No JSON object found');
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // Try repair
    try {
      const repaired = repairJson(jsonMatch[0]);
      parsed = JSON.parse(repaired);
      result.truncated = true;
      result.warnings.push('JSON was repaired from truncated response');
    } catch (e) {
      result.errors.push(`JSON parse error: ${e instanceof Error ? e.message : 'Unknown'}`);
      return;
    }
  }

  // Extract meta
  if (parsed.meta && typeof parsed.meta === 'object') {
    const meta = parsed.meta as Record<string, unknown>;
    result.meta = {
      format: String(meta.format || 'json'),
      version: String(meta.version || '2.0'),
      timestamp: meta.timestamp ? String(meta.timestamp) : undefined,
    };
  }

  // Extract plan
  if (parsed.plan && typeof parsed.plan === 'object') {
    const plan = parsed.plan as Record<string, unknown>;
    result.plan = {
      create: Array.isArray(plan.create) ? (plan.create as string[]) : [],
      update: Array.isArray(plan.update) ? (plan.update as string[]) : [],
      delete: Array.isArray(plan.delete) ? (plan.delete as string[]) : [],
    };
    result.deletedFiles = result.plan.delete;
  }

  // Extract manifest
  if (Array.isArray(parsed.manifest)) {
    result.manifest = (parsed.manifest as Record<string, unknown>[]).map(entry => ({
      path: String(entry.path || ''),
      action: (entry.action as FileAction) || 'create',
      lines: Number(entry.lines) || 0,
      tokens: Number(entry.tokens) || 0,
      status: (entry.status as ManifestEntry['status']) || 'included',
    }));
  }

  // Extract batch
  if (parsed.batch && typeof parsed.batch === 'object') {
    const batch = parsed.batch as Record<string, unknown>;
    result.batch = {
      current: Number(batch.current) || 1,
      total: Number(batch.total) || 1,
      isComplete: batch.isComplete !== false,
      completed: Array.isArray(batch.completed) ? (batch.completed as string[]) : [],
      remaining: Array.isArray(batch.remaining) ? (batch.remaining as string[]) : [],
      nextBatchHint: batch.nextBatchHint ? String(batch.nextBatchHint) : undefined,
    };

    if (!result.batch.isComplete) {
      result.truncated = true;
    }
  }

  // Extract explanation
  if (typeof parsed.explanation === 'string') {
    result.explanation = parsed.explanation;
  }

  // Extract files
  if (parsed.files && typeof parsed.files === 'object') {
    const filesObj = parsed.files as Record<string, unknown>;
    for (const [path, content] of Object.entries(filesObj)) {
      if (!path.includes('.') && !path.includes('/')) continue;
      if (isIgnoredPath(path)) continue;

      let contentStr: string;
      if (typeof content === 'string') {
        contentStr = content;
      } else if (typeof content === 'object' && content !== null) {
        const obj = content as Record<string, unknown>;
        contentStr = (obj.content || obj.code || '') as string;
      } else {
        continue;
      }

      const cleaned = cleanGeneratedCode(contentStr, path);
      if (cleaned && cleaned.length >= 10) {
        result.files[path] = cleaned;
      }
    }
  }
}

// ============================================================================
// MARKER PARSING
// ============================================================================

/**
 * Parse marker META block
 */
function parseMarkerMeta(response: string): MetaInfo | undefined {
  const match = findFirstMatch(/<!--\s*META\s*-->([\s\S]*?)<!--\s*\/META\s*-->/, response);
  if (!match) return undefined;

  const content = match[1].trim();
  const meta: MetaInfo = { format: 'marker', version: '1.0' };

  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'format') meta.format = value;
    else if (key === 'version') meta.version = value;
    else if (key === 'timestamp') meta.timestamp = value;
  }

  return meta;
}

/**
 * Parse marker PLAN block
 */
function parseMarkerPlan(response: string): PlanInfo | undefined {
  const match = findFirstMatch(/<!--\s*PLAN\s*-->([\s\S]*?)<!--\s*\/PLAN\s*-->/, response);
  if (!match) return undefined;

  const content = match[1].trim();
  const plan: PlanInfo = { create: [], update: [], delete: [] };

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('create:')) {
      plan.create = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    } else if (trimmed.startsWith('update:')) {
      plan.update = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    } else if (trimmed.startsWith('delete:')) {
      plan.delete = trimmed.slice(7).split(',').map(f => f.trim()).filter(Boolean);
    }
  }

  return plan;
}

/**
 * Parse marker MANIFEST block
 */
function parseMarkerManifest(response: string): ManifestEntry[] | undefined {
  const match = findFirstMatch(/<!--\s*MANIFEST\s*-->([\s\S]*?)<!--\s*\/MANIFEST\s*-->/, response);
  if (!match) return undefined;

  const content = match[1].trim();
  const entries: ManifestEntry[] = [];

  for (const line of content.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('| File') || line.startsWith('|--')) {
      continue;
    }

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length >= 4) {
      const [file, action, linesStr, tokensStr, status] = cells;
      entries.push({
        path: file,
        action: (['create', 'update', 'delete'].includes(action.toLowerCase())
          ? action.toLowerCase() : 'create') as FileAction,
        lines: parseInt(linesStr) || 0,
        tokens: parseInt(tokensStr.replace(/[~,]/g, '')) || 0,
        status: (['included', 'pending', 'marked', 'skipped'].includes(status?.toLowerCase())
          ? status.toLowerCase() : 'included') as ManifestEntry['status'],
      });
    }
  }

  return entries.length > 0 ? entries : undefined;
}

/**
 * Parse marker BATCH block
 */
function parseMarkerBatch(response: string): BatchInfo | undefined {
  const match = findFirstMatch(/<!--\s*BATCH\s*-->([\s\S]*?)<!--\s*\/BATCH\s*-->/, response);
  if (!match) return undefined;

  const content = match[1].trim();
  const batch: BatchInfo = {
    current: 1,
    total: 1,
    isComplete: true,
    completed: [],
    remaining: [],
  };

  for (const line of content.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (key === 'current') batch.current = parseInt(value) || 1;
    else if (key === 'total') batch.total = parseInt(value) || 1;
    else if (key === 'iscomplete') batch.isComplete = value.toLowerCase() === 'true';
    else if (key === 'completed') batch.completed = value.split(',').map(f => f.trim()).filter(Boolean);
    else if (key === 'remaining') batch.remaining = value.split(',').map(f => f.trim()).filter(Boolean);
    else if (key === 'nextbatchhint') batch.nextBatchHint = value;
  }

  return batch;
}

/**
 * Parse marker EXPLANATION block
 */
function parseMarkerExplanation(response: string): string | undefined {
  const match = findFirstMatch(/<!--\s*EXPLANATION\s*-->([\s\S]*?)<!--\s*\/EXPLANATION\s*-->/, response);
  return match ? match[1].trim() : undefined;
}

/**
 * Parse marker FILE blocks
 */
function parseMarkerFiles(response: string, result: ParseResult): void {
  const processedPaths = new Set<string>();

  // Step 1: Extract well-formed FILE blocks (opening + matching closing)
  const wellFormedMatches = findAllMatches(
    /<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->([\s\S]*?)<!--\s*\/FILE:\1\s*-->/g,
    response
  );

  for (const match of wellFormedMatches) {
    const path = match[1].trim();
    const content = match[2].replace(/^\n+/, '').replace(/\n+$/, '');

    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length > 0) {
      result.files[path] = cleaned;
      processedPaths.add(path);
    }
  }

  // Step 2: Find unclosed FILE blocks (opened but not properly closed)
  const openMatches = findAllMatches(/<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g, response);
  const openings: { path: string; index: number; endIndex: number }[] = [];

  for (const match of openMatches) {
    const path = match[1].trim();
    if (!processedPaths.has(path) && match.index !== undefined) {
      openings.push({
        path,
        index: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  // Process unclosed files
  for (let i = 0; i < openings.length; i++) {
    const current = openings[i];
    const isLast = i === openings.length - 1;
    const next = openings[i + 1];

    let contentEnd: number;
    if (isLast) {
      // Last file - find any closing marker or end of response
      const remaining = response.slice(current.endIndex);
      const nextMarkerMatch = findFirstMatch(/<!--\s*(?:\/FILE:|BATCH|GENERATION_META)/, remaining);
      contentEnd = nextMarkerMatch && nextMarkerMatch.index !== undefined
        ? current.endIndex + nextMarkerMatch.index
        : response.length;

      // This file is incomplete (streaming or truncated)
      if (!processedPaths.has(current.path)) {
        result.incompleteFiles = result.incompleteFiles || [];
        result.incompleteFiles.push(current.path);
      }
    } else {
      // Not the last file - content ends at next FILE marker
      contentEnd = next.index;
    }

    let content = response.slice(current.endIndex, contentEnd);
    content = content.replace(/^\n+/, '').replace(/\n+$/, '');

    // Remove any stray closing markers
    content = content.replace(/<!--\s*\/FILE:[^\n]*-->/g, '').trim();

    if (isIgnoredPath(current.path)) continue;

    const cleaned = cleanGeneratedCode(content, current.path);
    if (cleaned && cleaned.length > 0 && !processedPaths.has(current.path)) {
      result.files[current.path] = cleaned;
      processedPaths.add(current.path);

      // If not the last file, it was implicitly closed - mark as recovered
      if (!isLast) {
        result.recoveredFiles = result.recoveredFiles || [];
        result.recoveredFiles.push(current.path);
        result.warnings.push(`File "${current.path}" had missing closing marker - recovered`);
      }
    }
  }
}

/**
 * Parse marker format (v1 or v2)
 */
function parseMarker(response: string, result: ParseResult): void {
  result.meta = parseMarkerMeta(response);
  result.plan = parseMarkerPlan(response);
  result.manifest = parseMarkerManifest(response);
  result.batch = parseMarkerBatch(response);
  result.explanation = parseMarkerExplanation(response);

  if (result.plan?.delete) {
    result.deletedFiles = result.plan.delete;
  }

  if (result.batch && !result.batch.isComplete) {
    result.truncated = true;
  }

  parseMarkerFiles(response, result);

  // Validate manifest against files
  if (result.manifest) {
    const expectedIncluded = result.manifest
      .filter(e => e.status === 'included' && e.action !== 'delete')
      .map(e => e.path);
    const received = Object.keys(result.files);
    const missing = expectedIncluded.filter(f => !received.includes(f));

    if (missing.length > 0) {
      result.warnings.push(`Manifest validation: missing files: ${missing.join(', ')}`);
    }
  }
}

// ============================================================================
// FALLBACK PARSING
// ============================================================================

/**
 * Extract files from code blocks and patterns
 */
function parseFallback(response: string, result: ParseResult): void {
  result.warnings.push('Using fallback parser - response format not recognized');

  // Pattern 1: File path followed by code block
  const fileBlockMatches = findAllMatches(
    /(?:^|\n)([\w./-]+\.(?:tsx?|jsx?|css|json|md|html?))\s*\n```(?:\w+)?\s*\n([\s\S]*?)\n```/gm,
    response
  );

  for (const match of fileBlockMatches) {
    const path = match[1].trim();
    const content = match[2].trim();

    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
      result.recoveredFiles = result.recoveredFiles || [];
      result.recoveredFiles.push(path);
    }
  }

  // Pattern 2: File: path inside code block
  const fileInBlockMatches = findAllMatches(
    /```(?:\w+)?\s*\nFile:\s*([^\n]+)\n([\s\S]*?)\n```/g,
    response
  );

  for (const match of fileInBlockMatches) {
    const path = match[1].trim();
    const content = match[2].trim();

    if (result.files[path]) continue; // Already extracted
    if (isIgnoredPath(path)) continue;

    const cleaned = cleanGeneratedCode(content, path);
    if (cleaned && cleaned.length >= 10) {
      result.files[path] = cleaned;
      result.recoveredFiles = result.recoveredFiles || [];
      result.recoveredFiles.push(path);
    }
  }

  // Pattern 3: Just look for code blocks and infer file type
  if (Object.keys(result.files).length === 0) {
    const codeBlockMatches = findAllMatches(
      /```(?:tsx?|jsx?|typescript|javascript)\s*\n([\s\S]*?)\n```/g,
      response
    );
    let fileIndex = 1;

    for (const match of codeBlockMatches) {
      const content = match[1].trim();
      if (content.length < 50) continue;

      // Infer filename from content
      const hasReact = content.includes('import React') ||
                       content.includes('export default') ||
                       (content.includes('function ') && content.includes('return'));
      const hasExport = content.includes('export ');

      const path = hasReact
        ? `component${fileIndex}.tsx`
        : hasExport
        ? `module${fileIndex}.ts`
        : `code${fileIndex}.js`;

      const cleaned = cleanGeneratedCode(content, path);
      if (cleaned && cleaned.length >= 10) {
        result.files[path] = cleaned;
        result.recoveredFiles = result.recoveredFiles || [];
        result.recoveredFiles.push(path);
        fileIndex++;
      }
    }
  }

  if (Object.keys(result.files).length > 0) {
    result.format = 'fallback';
  }
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parse AI response with auto-detection and fallback
 */
export function parseAIResponse(response: string, options: ParserOptions = {}): ParseResult {
  const {
    includeRaw = false,
    maxSize = 500000,
    aggressiveRecovery = true,
  } = options;

  const result: ParseResult = {
    format: 'unknown',
    files: {},
    truncated: false,
    warnings: [],
    errors: [],
  };

  if (includeRaw) {
    result.rawResponse = response;
  }

  // Validate input
  if (!response || typeof response !== 'string') {
    result.errors.push('Empty or invalid response');
    return result;
  }

  if (response.length > maxSize) {
    result.errors.push(`Response too large (${Math.round(response.length / 1000)}KB > ${Math.round(maxSize / 1000)}KB limit)`);
    return result;
  }

  // Detect format
  result.format = detectFormat(response);

  // Parse based on format
  switch (result.format) {
    case 'json-v2':
      parseJsonV2(response, result);
      break;

    case 'json-v1':
      parseJsonV1(response, result);
      break;

    case 'marker-v2':
    case 'marker-v1':
      parseMarker(response, result);
      break;

    case 'fallback':
      parseFallback(response, result);
      break;

    case 'unknown':
      // Try JSON first, then marker, then fallback
      if (aggressiveRecovery) {
        parseJsonV1(response, result);
        if (Object.keys(result.files).length === 0) {
          parseMarker(response, result);
        }
        if (Object.keys(result.files).length === 0) {
          parseFallback(response, result);
        }
      }
      break;
  }

  // Log summary
  const fileCount = Object.keys(result.files).length;
  console.log(`[parseAIResponse] Format: ${result.format}, Files: ${fileCount}, Truncated: ${result.truncated}`);

  if (result.warnings.length > 0) {
    console.warn('[parseAIResponse] Warnings:', result.warnings);
  }

  if (result.errors.length > 0) {
    console.error('[parseAIResponse] Errors:', result.errors);
  }

  return result;
}

/**
 * Quick check if response has files
 */
export function hasFiles(response: string): boolean {
  const format = detectFormat(response);

  switch (format) {
    case 'json-v1':
    case 'json-v2':
      return /"files"\s*:\s*\{/.test(response) ||
             /"fileChanges"\s*:\s*\{/.test(response);
    case 'marker-v1':
    case 'marker-v2':
      return /<!--\s*FILE:/.test(response);
    case 'fallback':
      return /```(?:tsx?|jsx?)/.test(response);
    default:
      return false;
  }
}

/**
 * Extract file list from response (for progress tracking)
 */
export function extractFileList(response: string): string[] {
  const files = new Set<string>();
  const format = detectFormat(response);

  if (format.startsWith('marker')) {
    // From PLAN block
    const planMatch = findFirstMatch(/<!--\s*PLAN\s*-->([\s\S]*?)<!--\s*\/PLAN\s*-->/, response);
    if (planMatch) {
      const createMatch = findFirstMatch(/create:\s*([^\n]+)/, planMatch[1]);
      const updateMatch = findFirstMatch(/update:\s*([^\n]+)/, planMatch[1]);
      if (createMatch) {
        createMatch[1].split(',').forEach(f => files.add(f.trim()));
      }
      if (updateMatch) {
        updateMatch[1].split(',').forEach(f => files.add(f.trim()));
      }
    }

    // From FILE markers
    const fileMatches = findAllMatches(/<!--\s*FILE:([\w./-]+\.[a-zA-Z]+)\s*-->/g, response);
    for (const match of fileMatches) {
      files.add(match[1].trim());
    }
  } else {
    // JSON format - extract from keys
    const fileMatches = findAllMatches(/"([\w./-]+\.(?:tsx?|jsx?|css|json|md|ts|js))"\s*:/g, response);
    for (const match of fileMatches) {
      files.add(match[1]);
    }
  }

  return Array.from(files).filter(f => !isIgnoredPath(f)).sort();
}

/**
 * Get batch continuation prompt
 */
export function getBatchContinuationPrompt(result: ParseResult): string | null {
  if (!result.batch || result.batch.isComplete || result.batch.remaining.length === 0) {
    return null;
  }

  const remaining = result.batch.remaining;
  const completed = result.batch.completed;

  return `Continue generating the remaining ${remaining.length} files.

ALREADY COMPLETED (${completed.length} files):
${completed.map(f => `- ${f}`).join('\n')}

REMAINING FILES TO GENERATE:
${remaining.map(f => `- ${f}`).join('\n')}

Use the same format and structure. This is batch ${result.batch.current + 1} of ${result.batch.total}.`;
}

// Export for backwards compatibility
export { parseAIResponse as parse };
export default { parseAIResponse, detectFormat, hasFiles, extractFileList, getBatchContinuationPrompt };
