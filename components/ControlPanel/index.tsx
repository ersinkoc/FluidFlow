import React, { useState, useCallback, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
import { Layers, Trash2, AlertTriangle, X, MessageSquare, FileCode, History } from 'lucide-react';
import { FileSystem, ChatMessage, ChatAttachment, FileChange } from '../../types';
import { cleanGeneratedCode, parseMultiFileResponse } from '../../utils/cleanCode';
import { generateContextForPrompt } from '../../utils/codemap';
import { debugLog } from '../../hooks/useDebugStore';
import { getProviderManager, GenerationRequest } from '../../services/ai';
import { InspectedElement } from '../PreviewPanel/ComponentInspector';
import { useAIHistory } from '../../hooks/useAIHistory';
import { AIHistoryModal } from '../AIHistoryModal';
import { getContextManager, CONTEXT_IDS } from '../../services/conversationContext';
import { ContextIndicator } from '../ContextIndicator';
import { getFluidFlowConfig } from '../../services/fluidflowConfig';

// Sub-components
import { ChatPanel } from './ChatPanel';
import { ChatInput } from './ChatInput';
import { SettingsPanel } from './SettingsPanel';
import { ModeToggle } from './ModeToggle';
import { ProjectPanel } from './ProjectPanel';
import type { ProjectMeta } from '@/services/projectApi';

// Ref interface for external access
export interface ControlPanelRef {
  handleInspectEdit: (prompt: string, element: InspectedElement) => Promise<void>;
}

interface GitStatus {
  initialized: boolean;
  branch?: string;
  clean?: boolean;
}

interface ControlPanelProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;
  setSuggestions: (suggestions: string[] | null) => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
  resetApp: () => void;
  reviewChange: (label: string, newFiles: FileSystem) => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  onOpenAISettings?: () => void;
  // Project props
  currentProject?: ProjectMeta | null;
  projects?: ProjectMeta[];
  isServerOnline?: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: number | null;
  isLoadingProjects?: boolean;
  onCreateProject?: (name?: string, description?: string) => Promise<ProjectMeta | null>;
  onOpenProject?: (id: string) => Promise<boolean>;
  onDeleteProject?: (id: string) => Promise<boolean>;
  onDuplicateProject?: (id: string) => Promise<ProjectMeta | null>;
  onRefreshProjects?: () => Promise<void>;
  onCloseProject?: () => void;
  // Git status props for ProjectPanel
  gitStatus?: GitStatus | null;
  hasUncommittedChanges?: boolean;
  onOpenGitTab?: () => void;
}

// Calculate file changes between two file systems
function calculateFileChanges(oldFiles: FileSystem, newFiles: FileSystem): FileChange[] {
  const changes: FileChange[] = [];
  const allKeys = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  allKeys.forEach(path => {
    const oldContent = oldFiles[path] || '';
    const newContent = newFiles[path] || '';

    if (oldContent !== newContent) {
      const oldLines = oldContent ? oldContent.split('\n').length : 0;
      const newLines = newContent ? newContent.split('\n').length : 0;

      let type: 'added' | 'modified' | 'deleted' = 'modified';
      if (!oldContent) type = 'added';
      else if (!newContent) type = 'deleted';

      changes.push({
        path,
        type,
        additions: type === 'deleted' ? 0 : Math.max(0, newLines - oldLines + (type === 'added' ? newLines : 0)),
        deletions: type === 'added' ? 0 : Math.max(0, oldLines - newLines + (type === 'deleted' ? oldLines : 0))
      });
    }
  });

  return changes;
}

export const ControlPanel = forwardRef<ControlPanelRef, ControlPanelProps>(({
  files,
  setFiles,
  setSuggestions,
  isGenerating,
  setIsGenerating,
  resetApp,
  reviewChange,
  selectedModel,
  onModelChange,
  onOpenAISettings,
  // Project props
  currentProject,
  projects = [],
  isServerOnline = false,
  isSyncing = false,
  lastSyncedAt,
  isLoadingProjects = false,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onRefreshProjects,
  onCloseProject,
  // Git status props
  gitStatus,
  hasUncommittedChanges,
  onOpenGitTab
}, ref) => {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConsultantMode, setIsConsultantMode] = useState(false);
  const [isEducationMode, setIsEducationMode] = useState(false);
  const [, forceUpdate] = useState({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAIHistory, setShowAIHistory] = useState(false);

  // Streaming state
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [streamingChars, setStreamingChars] = useState(0);
  const [streamingFiles, setStreamingFiles] = useState<string[]>([]);

  // AI History - persists across refreshes
  const aiHistory = useAIHistory(currentProject?.id || null);

  // Context management
  const contextManager = getContextManager();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`);

  // Update session ID when project changes
  useEffect(() => {
    sessionIdRef.current = `${CONTEXT_IDS.MAIN_CHAT}-${currentProject?.id || 'default'}`;
  }, [currentProject?.id]);

  // Sync messages with context manager
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg) {
      contextManager.addMessage(
        sessionIdRef.current,
        lastMsg.role,
        lastMsg.role === 'user' ? (lastMsg.prompt || '') : (lastMsg.explanation || lastMsg.error || ''),
        { messageId: lastMsg.id }
      );
    }
  }, [messages.length]);

  const existingApp = files['src/App.tsx'];

  // Handle context compaction
  const handleCompaction = useCallback(async () => {
    const manager = getProviderManager();
    const config = getFluidFlowConfig();

    await contextManager.compactContext(sessionIdRef.current, async (text) => {
      const request: GenerationRequest = {
        prompt: `Summarize this conversation concisely, preserving key decisions, code changes, and context:\n\n${text}`,
        systemInstruction: 'You are a conversation summarizer. Create a brief but complete summary that captures the essential context, decisions made, and any code or technical details discussed.',
        responseFormat: 'text'
      };
      const response = await manager.generate(request);

      // Log compaction
      const context = contextManager.getContext(sessionIdRef.current);
      config.addCompactionLog({
        contextId: sessionIdRef.current,
        beforeTokens: context.estimatedTokens * 2,
        afterTokens: context.estimatedTokens,
        messagesSummarized: messages.length - 2,
        summary: response.text || 'Conversation compacted'
      });

      return response.text || '';
    });
  }, [messages.length]);

  // Handle provider changes from settings
  const handleProviderChange = useCallback((providerId: string, modelId: string) => {
    // Force re-render to update the active provider display
    forceUpdate({});
    // Model change handled through the provider's defaultModel
    onModelChange(modelId);
  }, [onModelChange]);

  const handleSend = async (prompt: string, attachments: ChatAttachment[], _fileContext?: string[]) => {
    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      timestamp: Date.now(),
      prompt: prompt || (attachments.length > 0 ? 'Generate from uploaded sketch' : ''),
      attachments: attachments.length > 0 ? attachments : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setSuggestions(null);

    // Get attachments
    const sketchAtt = attachments.find(a => a.type === 'sketch');
    const brandAtt = attachments.find(a => a.type === 'brand');

    try {
      const manager = getProviderManager();
      const activeProvider = manager.getActiveConfig();
      const currentModel = activeProvider?.defaultModel || selectedModel;
      const providerName = activeProvider?.name || 'AI';

      if (isConsultantMode) {
        // Consultant mode - return suggestions
        const systemInstruction = `You are a Senior Product Manager and UX Expert. Analyze the provided wireframe/sketch deeply.
Identify missing UX elements, accessibility gaps, logical inconsistencies, or edge cases.
Output ONLY a raw JSON array of strings containing your specific suggestions. Do not include markdown formatting.`;

        const images: { data: string; mimeType: string }[] = [];
        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          images.push({ data: base64Data, mimeType: sketchAtt.file.type });
        }

        const request: GenerationRequest = {
          prompt: prompt ? `Analyze this design. Context: ${prompt}` : 'Analyze this design for UX gaps.',
          systemInstruction,
          images,
          responseFormat: 'json'
        };

        const requestId = debugLog.request('generation', {
          model: currentModel,
          prompt: request.prompt,
          systemInstruction,
          attachments: attachments.map(a => ({ type: a.type, size: a.file.size })),
          metadata: { mode: 'consultant', provider: providerName }
        });
        const startTime = Date.now();

        const response = await manager.generate(request, currentModel);
        const text = response.text || '[]';

        debugLog.response('generation', {
          id: requestId,
          model: currentModel,
          duration: Date.now() - startTime,
          response: text,
          metadata: { mode: 'consultant', provider: providerName }
        });
        try {
          const suggestionsData = JSON.parse(text);
          setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : ['Could not parse suggestions.']);

          // Add assistant message
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation: `## UX Analysis Complete\n\nI found **${Array.isArray(suggestionsData) ? suggestionsData.length : 0} suggestions** to improve your design. Check the suggestions panel on the right.`,
            snapshotFiles: { ...files }
          };
          setMessages(prev => [...prev, assistantMessage]);
        } catch {
          setSuggestions(['Error parsing consultant suggestions.']);
        }
      } else {
        // Generate/Update app mode
        let systemInstruction = `You are an expert React Developer. Your task is to generate or update a React application.

**RESPONSE FORMAT**: You MUST return a JSON object with exactly two keys:
1. "explanation": A markdown string explaining what you built/changed, the components created, and any important technical decisions.
2. "files": A JSON object where keys are file paths and values are the code content.

**CODE REQUIREMENTS**:
- Entry point MUST be 'src/App.tsx'
- Break UI into logical sub-components in 'src/components/'
- Use RELATIVE import paths (e.g., './components/Header' from App.tsx, '../Header' from nested components)
- Use Tailwind CSS for styling
- Use 'lucide-react' for icons
- Create realistic mock data (5-8 entries), NO "Lorem Ipsum"
- Modern, clean aesthetic with generous padding

**EXPLANATION REQUIREMENTS**:
Write a clear markdown explanation including:
- What was built/changed
- List of components created with brief descriptions
- Any technical decisions or patterns used
- Tips for customization`;

        if (brandAtt) {
          systemInstruction += `\n\n**BRANDING**: Extract the PRIMARY DOMINANT COLOR from the brand logo and use it for primary actions/accents.`;
        }

        if (isEducationMode) {
          systemInstruction += `\n\n**EDUCATION MODE**: Add detailed inline comments explaining complex Tailwind classes and React hooks.`;
        }

        // Build prompt parts
        const promptParts: string[] = [];
        const images: { data: string; mimeType: string }[] = [];

        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          promptParts.push('SKETCH/WIREFRAME: [attached image]');
          images.push({ data: base64Data, mimeType: sketchAtt.file.type });
        }

        if (brandAtt) {
          const base64Data = brandAtt.preview.split(',')[1];
          promptParts.push('BRAND LOGO: [attached image]');
          images.push({ data: base64Data, mimeType: brandAtt.file.type });
        }

        if (existingApp) {
          // Generate codemap for better context understanding
          const codeContext = generateContextForPrompt(files);
          promptParts.push(`${codeContext}\n\n### Full Source Files\n\`\`\`json\n${JSON.stringify(files, null, 2)}\n\`\`\``);
          promptParts.push(`USER REQUEST: ${prompt || 'Refine the app based on the attached images.'}`);
          systemInstruction += `\n\nYou are UPDATING an existing project. The codemap above shows the current structure.
- Maintain existing component names and prop interfaces
- Keep import paths consistent with the current structure
- Return ALL files in the "files" object, including unchanged ones
- Only modify files that need changes based on the user request`;
        } else {
          promptParts.push(`TASK: Create a React app from this design. ${prompt ? `Additional context: ${prompt}` : ''}`);
        }

        const request: GenerationRequest = {
          prompt: promptParts.join('\n\n'),
          systemInstruction,
          images,
          responseFormat: 'json'
        };

        // Use streaming for better UX
        setStreamingStatus(`🚀 Starting generation with ${providerName}...`);
        setStreamingChars(0);
        setStreamingFiles([]);

        const genRequestId = debugLog.request('generation', {
          model: currentModel,
          prompt: prompt || 'Generate/Update app',
          systemInstruction,
          attachments: attachments.map(a => ({ type: a.type, size: a.file.size })),
          metadata: { mode: 'generator', hasExistingApp: !!existingApp, provider: providerName }
        });
        const genStartTime = Date.now();

        let fullText = '';
        let detectedFiles: string[] = [];
        let chunkCount = 0;

        // Create initial stream log entry (will be updated during streaming)
        const streamLogId = `stream-${genRequestId}`;
        debugLog.stream('generation', {
          id: streamLogId,
          model: currentModel,
          response: 'Streaming started...',
          metadata: { chunkCount: 0, totalChars: 0, filesDetected: 0, status: 'streaming' }
        });

        // Use streaming API
        await manager.generateStream(
          request,
          (chunk) => {
            const chunkText = chunk.text || '';
            fullText += chunkText;
            chunkCount++;
            setStreamingChars(fullText.length);

            // Update the stream log every 50 chunks (less frequent to avoid re-render issues)
            if (chunkCount % 50 === 0) {
              try {
                debugLog.streamUpdate(streamLogId, {
                  response: `Streaming... ${Math.round(fullText.length / 1024)}KB received`,
                  metadata: { chunkCount, totalChars: fullText.length, filesDetected: detectedFiles.length, status: 'streaming' }
                });
              } catch (e) {
                console.debug('[Debug] Stream update failed:', e);
              }
            }

            // Try to detect file paths as they appear (match any file path in JSON)
            const fileMatches = fullText.match(/"([^"]+\.(tsx?|jsx?|css|json|md|sql))"\s*:/g);
            if (fileMatches) {
              const newMatchedFiles = fileMatches
                .map(m => m.replace(/[":\s]/g, ''))
                .filter(f => !detectedFiles.includes(f) && !f.includes('\\'));
              if (newMatchedFiles.length > 0) {
                detectedFiles = [...detectedFiles, ...newMatchedFiles];
                setStreamingFiles([...detectedFiles]);
                setStreamingStatus(`📁 ${detectedFiles.length} files detected`);
              }
            }

            // Update status with character count
            if (detectedFiles.length === 0) {
              setStreamingStatus(`⚡ Generating... (${Math.round(fullText.length / 1024)}KB)`);
            }
          },
          currentModel
        );

        // Mark stream as complete (pass true to immediately notify UI)
        try {
          debugLog.streamUpdate(streamLogId, {
            response: `Completed: ${Math.round(fullText.length / 1024)}KB, ${chunkCount} chunks`,
            metadata: { chunkCount, totalChars: fullText.length, filesDetected: detectedFiles.length, status: 'complete' }
          }, true); // complete=true for immediate UI update
        } catch (e) {
          console.debug('[Debug] Final stream update failed:', e);
        }

        setStreamingStatus('✨ Parsing response...');

        // Save raw response for debugging (stored in window for easy access)
        try {
          (window as any).__lastAIResponse = {
            raw: fullText,
            timestamp: Date.now(),
            chars: fullText.length,
            filesDetected: detectedFiles
          };
          console.log('[Debug] Raw response saved to window.__lastAIResponse (' + fullText.length + ' chars)');
        } catch (e) {
          console.debug('[Debug] Could not save raw response:', e);
        }

        try {
          // Use robust parser with truncation repair
          const parseResult = parseMultiFileResponse(fullText);
          if (!parseResult) {
            throw new Error('Could not parse response - no valid file content found');
          }

          const explanation = parseResult.explanation || 'App generated successfully.';
          const newFiles = parseResult.files;

          // Warn if response was truncated but we recovered
          if (parseResult.truncated) {
            console.warn('[Generation] Response was truncated but partially recovered');
            setStreamingStatus('⚠️ Response truncated - showing recovered files');
          }

          debugLog.response('generation', {
            id: genRequestId,
            model: currentModel,
            duration: Date.now() - genStartTime,
            response: JSON.stringify({ explanation, fileCount: Object.keys(newFiles).length, files: Object.keys(newFiles) }),
            metadata: { mode: 'generator', totalChunks: chunkCount, totalChars: fullText.length, provider: providerName }
          });

          // Clean code in each file
          for (const [path, content] of Object.entries(newFiles)) {
            if (typeof content === 'string') {
              newFiles[path] = cleanGeneratedCode(content);
            }
          }

          // Ensure we have src/App.tsx
          if (!newFiles['src/App.tsx']) {
            throw new Error('No src/App.tsx in response');
          }

          const mergedFiles = { ...files, ...newFiles };
          const fileChanges = calculateFileChanges(files, mergedFiles);

          setStreamingStatus(`✅ Generated ${Object.keys(newFiles).length} files!`);

          // Save to AI history (persistent)
          aiHistory.addEntry({
            timestamp: Date.now(),
            prompt: prompt || 'Generate app',
            model: currentModel,
            provider: providerName,
            hasSketch: !!sketchAtt,
            hasBrand: !!brandAtt,
            isUpdate: !!existingApp,
            rawResponse: fullText,
            responseChars: fullText.length,
            responseChunks: chunkCount,
            durationMs: Date.now() - genStartTime,
            success: true,
            truncated: parseResult.truncated,
            filesGenerated: Object.keys(newFiles),
            explanation
          });

          // Add assistant message
          const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            explanation,
            files: newFiles,
            fileChanges,
            snapshotFiles: { ...files } // Save state before this change for revert
          };
          setMessages(prev => [...prev, assistantMessage]);

          // Show diff modal
          reviewChange(existingApp ? 'Updated App' : 'Generated Initial App', mergedFiles);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'Parse error';
          console.error('Parse error:', errorMsg);
          console.error('Response preview:', fullText.slice(0, 500));
          console.error('Response end:', fullText.slice(-200));
          setStreamingStatus('❌ ' + errorMsg);

          debugLog.error('generation', errorMsg, {
            id: genRequestId,
            model: currentModel,
            duration: Date.now() - genStartTime,
            response: fullText.slice(0, 1000) + '\n...\n' + fullText.slice(-500),
            metadata: {
              mode: 'generator',
              totalChunks: chunkCount,
              totalChars: fullText.length,
              provider: providerName,
              hint: 'Check window.__lastAIResponse in console for full response'
            }
          });

          // Save failed attempt to AI history
          aiHistory.addEntry({
            timestamp: Date.now(),
            prompt: prompt || 'Generate app',
            model: currentModel,
            provider: providerName,
            hasSketch: !!sketchAtt,
            hasBrand: !!brandAtt,
            isUpdate: !!existingApp,
            rawResponse: fullText,
            responseChars: fullText.length,
            responseChunks: chunkCount,
            durationMs: Date.now() - genStartTime,
            success: false,
            error: errorMsg,
            truncated: true
          });

          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            error: errorMsg + ' (Check browser console for raw response)',
            snapshotFiles: { ...files }
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }
    } catch (error) {
      console.error('Error generating content:', error);

      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      debugLog.error('generation', error instanceof Error ? error.message : 'Unknown error', {
        model: activeConfig?.defaultModel || selectedModel,
        metadata: { mode: isConsultantMode ? 'consultant' : 'generator', provider: activeConfig?.name }
      });

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        snapshotFiles: { ...files }
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
      // Clear streaming status after a delay so user sees final status
      setTimeout(() => {
        setStreamingStatus('');
        setStreamingChars(0);
      }, 2000);
    }
  };

  const handleRevert = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.snapshotFiles) {
      reviewChange(`Revert to earlier state`, message.snapshotFiles);
    }
  };

  const handleRetry = (errorMessageId: string) => {
    // Find the error message and the user message before it
    const errorIndex = messages.findIndex(m => m.id === errorMessageId);
    if (errorIndex < 1) return;

    const userMessage = messages[errorIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the error message and user message from chat
    setMessages(prev => prev.filter((_, i) => i !== errorIndex && i !== errorIndex - 1));

    // Re-send the request
    handleSend(
      userMessage.prompt || '',
      userMessage.attachments || []
    );
  };

  // Handle inspect edit from PreviewPanel - with chat history and streaming
  const handleInspectEdit = useCallback(async (prompt: string, element: InspectedElement) => {
    const appCode = files['src/App.tsx'];
    if (!appCode) return;

    // Add user message showing the inspect edit request
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      timestamp: Date.now(),
      prompt: `🎯 **Inspect Edit**: ${element.componentName || element.tagName}\n\n${prompt}`,
    };
    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);

    // Setup streaming state
    const manager = getProviderManager();
    const activeProvider = manager.getActiveConfig();
    const currentModel = activeProvider?.defaultModel || selectedModel;
    const providerName = activeProvider?.name || 'AI';

    setStreamingStatus(`🔍 Analyzing ${element.componentName || element.tagName}...`);
    setStreamingChars(0);
    setStreamingFiles([]);

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

    const request: GenerationRequest = {
      prompt: `${elementContext}\n\nUser Request: ${prompt}\n\nCurrent files:\n${JSON.stringify(files, null, 2)}`,
      systemInstruction,
      responseFormat: 'json'
    };

    try {
      let fullText = '';
      let detectedFiles: string[] = [];

      await manager.generateStream(
        request,
        (chunk) => {
          const chunkText = chunk.text || '';
          fullText += chunkText;
          setStreamingChars(fullText.length);

          // Detect file paths
          const fileMatches = fullText.match(/"([^"]+\.(tsx?|jsx?|css|json|md))"\s*:/g);
          if (fileMatches) {
            const newMatchedFiles = fileMatches
              .map(m => m.replace(/[":\s]/g, ''))
              .filter(f => !detectedFiles.includes(f) && !f.includes('\\'));
            if (newMatchedFiles.length > 0) {
              detectedFiles = [...detectedFiles, ...newMatchedFiles];
              setStreamingFiles([...detectedFiles]);
              setStreamingStatus(`📁 Modifying ${detectedFiles.length} file(s)`);
            }
          }

          if (detectedFiles.length === 0) {
            setStreamingStatus(`⚡ Generating changes... (${Math.round(fullText.length / 1024)}KB)`);
          }
        },
        currentModel
      );

      setStreamingStatus('✨ Applying changes...');

      // Save raw response for debugging
      (window as any).__lastAIResponse = { raw: fullText, timestamp: Date.now(), type: 'inspect-edit' };

      // Use robust parser with truncation repair
      const parseResult = parseMultiFileResponse(fullText);
      const explanation = parseResult?.explanation || 'Component updated successfully.';
      const newFilesFromResult = parseResult?.files || {};

      if (parseResult?.truncated) {
        console.warn('[InspectEdit] Response was truncated but partially recovered');
      }

      if (Object.keys(newFilesFromResult).length > 0) {
        const mergedFiles = { ...files, ...newFilesFromResult };
        const fileChanges = calculateFileChanges(files, mergedFiles);

        setStreamingStatus(`✅ Modified ${Object.keys(newFilesFromResult).length} file(s)${parseResult?.truncated ? ' (truncated)' : ''}`);

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation,
          files: newFilesFromResult,
          fileChanges,
          snapshotFiles: { ...files }
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Show diff modal
        reviewChange(`Inspect Edit: ${element.componentName || element.tagName}`, mergedFiles);
      } else {
        // No changes made
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          explanation: explanation || 'No changes were needed for this component.'
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Inspect edit failed:', error);
      setStreamingStatus('❌ Edit failed');

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Failed to process inspect edit'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGenerating(false);
      setTimeout(() => {
        setStreamingStatus('');
        setStreamingFiles([]);
      }, 2000);
    }
  }, [files, selectedModel, reviewChange, setIsGenerating]);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    handleInspectEdit
  }), [handleInspectEdit]);

  const handleResetClick = () => {
    setShowResetConfirm(true);
  };

  const handleConfirmReset = () => {
    setMessages([]);
    contextManager.clearContext(sessionIdRef.current);
    resetApp();
    setShowResetConfirm(false);
  };

  return (
    <aside className="w-full md:w-[30%] md:min-w-[360px] md:max-w-[440px] h-full min-h-0 flex flex-col bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden relative z-20 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-white/5">
            <Layers className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-slate-300">
              FluidFlow
            </h1>
            <p className="text-[10px] text-slate-500 font-medium tracking-wide">AI APP BUILDER</p>
          </div>
        </div>

        <button
          onClick={handleResetClick}
          className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
          title="Start Fresh"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Context Indicator */}
      <div className="px-4 py-2 border-b border-white/5 flex-shrink-0">
        <ContextIndicator
          contextId={sessionIdRef.current}
          showLabel={true}
          onCompact={handleCompaction}
          className="w-full"
        />
      </div>

      {/* Chat Messages */}
      <ChatPanel
        messages={messages}
        onRevert={handleRevert}
        onRetry={handleRetry}
        isGenerating={isGenerating}
        streamingStatus={streamingStatus}
        streamingChars={streamingChars}
        streamingFiles={streamingFiles}
        aiHistoryCount={aiHistory.history.filter(h => h.success).length}
        onRestoreFromHistory={() => {
          // Restore the most recent successful entry directly
          const lastEntry = aiHistory.history.find(h => h.success);
          if (!lastEntry) return;

          try {
            // Find all history entries up to and including this one (by timestamp)
            const entriesToRestore = aiHistory.history
              .filter(h => h.timestamp <= lastEntry.timestamp && h.success)
              .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

            // Reconstruct ALL chat messages from history
            const restoredMessages: ChatMessage[] = [];
            let previousFiles: FileSystem = {};

            for (const historyEntry of entriesToRestore) {
              // Parse files from this entry
              const parsed = parseMultiFileResponse(historyEntry.rawResponse);
              if (!parsed?.files) continue;

              // Clean the generated code
              const cleanedFiles: FileSystem = {};
              for (const [path, content] of Object.entries(parsed.files)) {
                cleanedFiles[path] = cleanGeneratedCode(content);
              }

              // Calculate file changes
              const mergedFiles = { ...previousFiles, ...cleanedFiles };
              const fileChanges = calculateFileChanges(previousFiles, mergedFiles);

              // User message
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'user',
                timestamp: historyEntry.timestamp - 1000,
                prompt: historyEntry.prompt,
                attachments: historyEntry.hasSketch || historyEntry.hasBrand ? [
                  ...(historyEntry.hasSketch ? [{ type: 'sketch' as const, preview: '', file: new File([], 'sketch.png') }] : []),
                  ...(historyEntry.hasBrand ? [{ type: 'brand' as const, preview: '', file: new File([], 'brand.png') }] : [])
                ] : undefined
              });

              // Assistant message with file changes
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: historyEntry.timestamp,
                files: historyEntry.filesGenerated || Object.keys(cleanedFiles),
                explanation: parsed.explanation || historyEntry.explanation || '',
                fileChanges,
                snapshotFiles: cleanedFiles
              });

              // Track files for next iteration
              previousFiles = mergedFiles;
            }

            if (Object.keys(previousFiles).length > 0) {
              setMessages(restoredMessages);
              setFiles(previousFiles);
            }
          } catch (error) {
            console.error('[ControlPanel] Failed to restore from history:', error);
          }
        }}
      />

      {/* Mode Toggle */}
      <div className="px-3 py-2 border-t border-white/5 flex-shrink-0">
        <ModeToggle
          isConsultantMode={isConsultantMode}
          onToggle={() => setIsConsultantMode(!isConsultantMode)}
        />
      </div>

      {/* Chat Input */}
      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        hasExistingApp={!!existingApp}
        placeholder={isConsultantMode ? "Describe what to analyze..." : undefined}
        files={files}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isEducationMode={isEducationMode}
        onEducationModeChange={setIsEducationMode}
        hasApiKey={(() => {
          const manager = getProviderManager();
          const config = manager.getActiveConfig();
          return !!(config?.apiKey || config?.isLocal);
        })()}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        onProviderChange={handleProviderChange}
        onOpenAISettings={onOpenAISettings}
        aiHistoryCount={aiHistory.history.length}
        onOpenAIHistory={() => setShowAIHistory(true)}
      />

      {/* Project Panel */}
      {onCreateProject && onOpenProject && onDeleteProject && onDuplicateProject && onRefreshProjects && onCloseProject && (
        <ProjectPanel
          currentProject={currentProject || null}
          projects={projects}
          isServerOnline={isServerOnline}
          isSyncing={isSyncing}
          lastSyncedAt={lastSyncedAt || null}
          isLoadingProjects={isLoadingProjects}
          onCreateProject={onCreateProject}
          onOpenProject={onOpenProject}
          onDeleteProject={onDeleteProject}
          onDuplicateProject={onDuplicateProject}
          onRefreshProjects={onRefreshProjects}
          onCloseProject={onCloseProject}
          gitStatus={gitStatus}
          hasUncommittedChanges={hasUncommittedChanges}
          onOpenGitTab={onOpenGitTab}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-slate-950/98 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-white/10 bg-red-500/5">
              <div className="p-2 bg-red-500/20 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Start Fresh?</h3>
                <p className="text-sm text-slate-400">This action cannot be undone</p>
              </div>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">
                Starting fresh will clear the following:
              </p>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <MessageSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Chat History</p>
                    <p className="text-xs text-slate-500">All messages and conversation context</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <FileCode className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Generated Code</p>
                    <p className="text-xs text-slate-500">All files and the preview will be cleared</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                  <History className="w-5 h-5 text-green-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Version History</p>
                    <p className="text-xs text-slate-500">All undo/redo states will be lost</p>
                  </div>
                </div>
              </div>

              {/* Uncommitted Changes Warning */}
              {currentProject && hasUncommittedChanges && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Uncommitted Changes</p>
                      <p className="text-xs text-amber-400/80 mt-1">
                        You have unsaved changes in project "{currentProject.name}".
                        These changes will be lost if you reset.
                      </p>
                      <button
                        onClick={() => {
                          setShowResetConfirm(false);
                          onOpenGitTab?.();
                        }}
                        className="text-xs text-amber-300 hover:text-amber-200 underline mt-2"
                      >
                        Review changes in Git tab
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-5 border-t border-white/10 bg-slate-900/30">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-800 rounded-lg border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Yes, Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI History Modal */}
      <AIHistoryModal
        isOpen={showAIHistory}
        onClose={() => setShowAIHistory(false)}
        history={aiHistory.history}
        onClearHistory={aiHistory.clearHistory}
        onDeleteEntry={aiHistory.deleteEntry}
        onExportHistory={aiHistory.exportHistory}
        onRestoreEntry={async (entry) => {
          try {
            // Find all history entries up to and including this one (by timestamp)
            const entriesToRestore = aiHistory.history
              .filter(h => h.timestamp <= entry.timestamp && h.success)
              .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

            // Reconstruct ALL chat messages from history
            const restoredMessages: ChatMessage[] = [];
            let previousFiles: FileSystem = {};

            for (const historyEntry of entriesToRestore) {
              // Parse files from this entry
              const parsed = parseMultiFileResponse(historyEntry.rawResponse);
              if (!parsed?.files) continue;

              // Clean the generated code
              const cleanedFiles: FileSystem = {};
              for (const [path, content] of Object.entries(parsed.files)) {
                cleanedFiles[path] = cleanGeneratedCode(content);
              }

              // Calculate file changes
              const mergedFiles = { ...previousFiles, ...cleanedFiles };
              const fileChanges = calculateFileChanges(previousFiles, mergedFiles);

              // User message
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'user',
                timestamp: historyEntry.timestamp - 1000,
                prompt: historyEntry.prompt,
                attachments: historyEntry.hasSketch || historyEntry.hasBrand ? [
                  ...(historyEntry.hasSketch ? [{ type: 'sketch' as const, preview: '', file: new File([], 'sketch.png') }] : []),
                  ...(historyEntry.hasBrand ? [{ type: 'brand' as const, preview: '', file: new File([], 'brand.png') }] : [])
                ] : undefined
              });

              // Assistant message with file changes
              restoredMessages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                timestamp: historyEntry.timestamp,
                files: historyEntry.filesGenerated || Object.keys(cleanedFiles),
                explanation: parsed.explanation || historyEntry.explanation || '',
                fileChanges,
                snapshotFiles: cleanedFiles
              });

              // Track files for next iteration
              previousFiles = mergedFiles;
            }

            if (Object.keys(previousFiles).length === 0) {
              console.error('[ControlPanel] No files found in history entries');
              return false;
            }

            // Restore messages and files directly (no diff modal)
            setMessages(restoredMessages);
            setFiles(previousFiles);

            return true;
          } catch (error) {
            console.error('[ControlPanel] Failed to restore from history:', error);
            return false;
          }
        }}
      />
    </aside>
  );
});

ControlPanel.displayName = 'ControlPanel';
