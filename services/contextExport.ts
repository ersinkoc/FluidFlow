/**
 * Context Export/Import Service
 *
 * Manages exporting and importing conversation contexts
 */

import { getContextManager } from './conversationContext';
import { saveAs } from 'file-saver';

export interface ContextExport {
  version: string;
  exportDate: string;
  contextId: string;
  contextName?: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp?: number;
  }>;
  metadata: {
    totalMessages: number;
    estimatedTokens: number;
  };
}

/**
 * Export a context to JSON file
 */
export async function exportContext(contextId: string, filename?: string): Promise<void> {
  const contextManager = getContextManager();
  const context = contextManager.getContext(contextId);

  const exportData: ContextExport = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    contextId,
    contextName: context.name,
    messages: context.messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    })),
    metadata: {
      totalMessages: context.messages.length,
      estimatedTokens: context.estimatedTokens,
    },
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const defaultFilename = `context-${contextId}-${new Date().toISOString().split('T')[0]}.json`;

  saveAs(blob, filename ?? defaultFilename);
}

/**
 * Import a context from JSON file
 */
export async function importContext(file: File): Promise<{
  success: boolean;
  contextId?: string;
  messageCount?: number;
  error?: string;
}> {
  try {
    const text = await file.text();
    const data = JSON.parse(text) as ContextExport;

    // Validate the export data
    if (!data.version || !data.messages || !Array.isArray(data.messages)) {
      return {
        success: false,
        error: 'Invalid context file format',
      };
    }

    const contextManager = getContextManager();

    // Check if context with same ID exists, ask for overwrite
    const existingContext = contextId => {
      try {
        contextManager.getContext(contextId);
        return true;
      } catch {
        return false;
      }
    };

    const targetContextId = data.contextId;
    const needsNewId = existingContext(targetContextId);
    const finalContextId = needsNewId ? `${targetContextId}-import-${Date.now()}` : targetContextId;

    // Clear existing messages if any, then add imported ones
    if (needsNewId) {
      contextManager.getContext(finalContextId);
    } else {
      contextManager.clearContext(targetContextId);
    }

    // Import messages
    for (const msg of data.messages) {
      contextManager.addMessage(finalContextId, msg.role as 'user' | 'assistant' | 'system', msg.content);
    }

    return {
      success: true,
      contextId: finalContextId,
      messageCount: data.messages.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Export all contexts
 */
export async function exportAllContexts(): Promise<void> {
  const contextManager = getContextManager();
  const contexts = contextManager.listContexts();

  const allContexts = contexts.map(ctx => {
    const context = contextManager.getContext(ctx.id);
    return {
      id: ctx.id,
      name: ctx.name,
      messages: context.messages,
      estimatedTokens: context.estimatedTokens,
    };
  });

  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    contexts: allContexts,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  saveAs(blob, `all-contexts-${new Date().toISOString().split('T')[0]}.json`);
}

/**
 * Import contexts from exported file
 */
export async function importContexts(file: File): Promise<{
  success: boolean;
  importedCount?: number;
  error?: string;
}> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data.version || !data.contexts || !Array.isArray(data.contexts)) {
      return {
        success: false,
        error: 'Invalid contexts file format',
      };
    }

    const contextManager = getContextManager();
    let importedCount = 0;

    for (const ctx of data.contexts) {
      try {
        const targetContextId = `${ctx.id}-import-${Date.now()}`;
        contextManager.getContext(targetContextId);

        for (const msg of ctx.messages) {
          contextManager.addMessage(targetContextId, msg.role, msg.content);
        }
        importedCount++;
      } catch {
        // Skip invalid contexts
      }
    }

    return {
      success: true,
      importedCount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
