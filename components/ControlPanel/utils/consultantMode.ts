/**
 * consultantMode - Handles consultant/UX analysis mode
 */

import { ChatMessage, ChatAttachment, FileSystem } from '@/types';
import { getProviderManager, GenerationRequest } from '@/services/ai';
import { SUGGESTIONS_SCHEMA } from '@/services/ai/utils/schemas';
import { debugLog } from '@/hooks/useDebugStore';
import { CONSULTANT_SYSTEM_INSTRUCTION } from '../prompts';

interface ConsultantModeResult {
  suggestions: string[];
  message: ChatMessage;
}

interface ConsultantModeParams {
  prompt: string;
  attachments: ChatAttachment[];
  files: FileSystem;
  selectedModel: string;
}

/**
 * Execute consultant mode - analyze design and return UX suggestions
 */
export async function executeConsultantMode({
  prompt,
  attachments,
  files,
  selectedModel,
}: ConsultantModeParams): Promise<ConsultantModeResult> {
  const manager = getProviderManager();
  const activeProvider = manager.getActiveConfig();
  const currentModel = activeProvider?.defaultModel || selectedModel;
  const providerName = activeProvider?.name || 'AI';

  const sketchAtt = attachments.find(a => a.type === 'sketch');

  const images: { data: string; mimeType: string }[] = [];
  if (sketchAtt) {
    const base64Data = sketchAtt.preview.split(',')[1];
    images.push({ data: base64Data, mimeType: sketchAtt.file.type });
  }

  const request: GenerationRequest = {
    prompt: prompt ? `Analyze this design. Context: ${prompt}` : 'Analyze this design for UX gaps.',
    systemInstruction: CONSULTANT_SYSTEM_INSTRUCTION,
    images,
    responseFormat: 'json',
    responseSchema: SUGGESTIONS_SCHEMA
  };

  const requestId = debugLog.request('generation', {
    model: currentModel,
    prompt: request.prompt,
    systemInstruction: CONSULTANT_SYSTEM_INSTRUCTION,
    attachments: attachments.map(a => ({ type: a.type, size: a.file.size })),
    metadata: { mode: 'consultant', provider: providerName }
  });
  const startTime = Date.now();

  const response = await manager.generate(request, currentModel);
  const text = response.text || '[]';
  const duration = Date.now() - startTime;

  debugLog.response('generation', {
    id: requestId,
    model: currentModel,
    duration,
    response: text,
    metadata: { mode: 'consultant', provider: providerName }
  });

  let suggestions: string[];
  try {
    const suggestionsData = JSON.parse(text);
    suggestions = Array.isArray(suggestionsData) ? suggestionsData : ['Could not parse suggestions.'];
  } catch {
    suggestions = ['Error parsing consultant suggestions.'];
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'assistant',
    timestamp: Date.now(),
    explanation: `## UX Analysis Complete\n\nI found **${suggestions.length} suggestions** to improve your design. Check the suggestions panel on the right.`,
    snapshotFiles: { ...files },
    model: currentModel,
    provider: providerName,
    generationTime: duration,
    tokenUsage: response.usage ? {
      inputTokens: response.usage.inputTokens || 0,
      outputTokens: response.usage.outputTokens || 0,
      totalTokens: (response.usage.inputTokens || 0) + (response.usage.outputTokens || 0)
    } : undefined
  };

  return { suggestions, message };
}
