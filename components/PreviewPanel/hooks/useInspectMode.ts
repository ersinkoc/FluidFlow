/**
 * useInspectMode - Handles component inspection logic
 *
 * Manages:
 * - Inspect mode toggle
 * - Element editing state
 * - Inspect edit handler (local fallback)
 */

import { useState, useCallback } from 'react';
import { FileSystem } from '@/types';
import { getProviderManager } from '@/services/ai';
import { cleanGeneratedCode } from '@/utils/cleanCode';
import { FILE_GENERATION_SCHEMA, supportsAdditionalProperties } from '@/services/ai/utils/schemas';
import { InspectedElement, EditScope } from '../ComponentInspector';

interface UseInspectModeOptions {
  files: FileSystem;
  appCode: string | undefined;
  selectedModel: string;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  onExternalInspectEdit?: (prompt: string, element: InspectedElement, scope: EditScope) => Promise<void>;
  onClearInspectedElement: () => void;
  // External isInspectEditing state (shared with useIframeMessaging)
  isInspectEditing: boolean;
  setIsInspectEditing: (value: boolean) => void;
}

export function useInspectMode({
  files,
  appCode,
  selectedModel,
  reviewChange,
  onExternalInspectEdit,
  onClearInspectedElement,
  isInspectEditing,
  setIsInspectEditing,
}: UseInspectModeOptions) {
  const [isInspectMode, setIsInspectMode] = useState(false);

  // Toggle inspect mode
  const toggleInspectMode = useCallback(() => {
    setIsInspectMode(prev => !prev);
    onClearInspectedElement();
  }, [onClearInspectedElement]);

  // Exit inspect mode
  const exitInspectMode = useCallback(() => {
    setIsInspectMode(false);
    onClearInspectedElement();
  }, [onClearInspectedElement]);

  // Handle targeted component edit
  const handleInspectEdit = useCallback(async (
    prompt: string,
    element: InspectedElement,
    scope: EditScope
  ) => {
    if (!appCode) return;
    setIsInspectEditing(true);

    // If external handler provided (with chat history support), use it
    if (onExternalInspectEdit) {
      try {
        await onExternalInspectEdit(prompt, element, scope);
        exitInspectMode();
      } catch (error) {
        console.error('Inspect edit failed:', error);
      } finally {
        setIsInspectEditing(false);
      }
      return;
    }

    // Fallback to local implementation using provider manager
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const elementContext = `
Target Element:
- Tag: <${element.tagName.toLowerCase()}>
- Component: ${element.componentName || 'Unknown'}
- Classes: ${element.className || 'none'}
- ID: ${element.id || 'none'}
- Text content: "${element.textContent?.slice(0, 100) || ''}"
${element.parentComponents ? `- Parent components: ${element.parentComponents.join(' > ')}` : ''}
`;

      const systemInstruction = `You are an expert React developer. The user has selected a specific element/component in their app and wants to modify it.

Based on the element information provided, identify which file and component needs to be modified, then make the requested changes.

**RESPONSE FORMAT**: Return a JSON object with:
1. "explanation": Brief markdown explaining what you changed
2. "files": Object with file paths as keys and updated code as values

Only return files that need changes. Maintain all existing functionality.`;

      const response = await manager.generate({
        prompt: `${elementContext}\n\nUser Request: ${prompt}\n\nCurrent files:\n${JSON.stringify(files, null, 2)}`,
        systemInstruction,
        responseFormat: 'json',
        responseSchema: activeConfig?.type && supportsAdditionalProperties(activeConfig.type)
          ? FILE_GENERATION_SCHEMA
          : undefined,
        debugCategory: 'quick-edit'
      }, currentModel);

      const text = response.text || '{}';
      const result = JSON.parse(cleanGeneratedCode(text));

      if (result.files && Object.keys(result.files).length > 0) {
        const newFiles = { ...files, ...result.files };
        reviewChange(`Edit: ${element.componentName || element.tagName}`, newFiles);
      }

      exitInspectMode();
    } catch (error) {
      console.error('Inspect edit failed:', error);
    } finally {
      setIsInspectEditing(false);
    }
  }, [appCode, selectedModel, files, reviewChange, onExternalInspectEdit, exitInspectMode, setIsInspectEditing]);

  return {
    isInspectMode,
    isInspectEditing,
    toggleInspectMode,
    exitInspectMode,
    handleInspectEdit,
  };
}
