import React, { useState } from 'react';
import { Layers, Trash2, Settings } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { FileSystem, ChatMessage, ChatAttachment, FileChange } from '../../types';

// Sub-components
import { ChatPanel } from './ChatPanel';
import { ChatInput } from './ChatInput';
import { SettingsPanel } from './SettingsPanel';
import { ModeToggle } from './ModeToggle';

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

export const ControlPanel: React.FC<ControlPanelProps> = ({
  files,
  setFiles,
  setSuggestions,
  isGenerating,
  setIsGenerating,
  resetApp,
  reviewChange,
  selectedModel,
  onModelChange
}) => {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConsultantMode, setIsConsultantMode] = useState(false);
  const [isEducationMode, setIsEducationMode] = useState(false);

  const existingApp = files['src/App.tsx'];

  const handleSend = async (prompt: string, attachments: ChatAttachment[]) => {
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      if (isConsultantMode) {
        // Consultant mode - return suggestions
        const systemInstruction = `You are a Senior Product Manager and UX Expert. Analyze the provided wireframe/sketch deeply.
Identify missing UX elements, accessibility gaps, logical inconsistencies, or edge cases.
Output ONLY a raw JSON array of strings containing your specific suggestions. Do not include markdown formatting.`;

        const parts: any[] = [];
        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          parts.push({ inlineData: { mimeType: sketchAtt.file.type, data: base64Data } });
        }
        parts.push({
          text: prompt ? `Analyze this design. Context: ${prompt}` : 'Analyze this design for UX gaps.'
        });

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });

        const text = response.text || '[]';
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
- Use absolute import paths matching file keys (e.g., 'src/components/Header')
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

        const parts: any[] = [];

        if (sketchAtt) {
          const base64Data = sketchAtt.preview.split(',')[1];
          parts.push({ text: 'SKETCH/WIREFRAME:' });
          parts.push({ inlineData: { mimeType: sketchAtt.file.type, data: base64Data } });
        }

        if (brandAtt) {
          const base64Data = brandAtt.preview.split(',')[1];
          parts.push({ text: 'BRAND LOGO:' });
          parts.push({ inlineData: { mimeType: brandAtt.file.type, data: base64Data } });
        }

        if (existingApp) {
          parts.push({ text: `CURRENT PROJECT FILES:\n${JSON.stringify(files, null, 2)}` });
          parts.push({ text: `USER REQUEST: ${prompt || 'Refine the app based on the attached images.'}` });
          systemInstruction += '\n\nYou are UPDATING an existing project. Return ALL files in the "files" object, including unchanged ones.';
        } else {
          parts.push({ text: `TASK: Create a React app from this design. ${prompt ? `Additional context: ${prompt}` : ''}` });
        }

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });

        const text = response.text || '{}';

        try {
          const result = JSON.parse(text);
          const explanation = result.explanation || 'App generated successfully.';
          const newFiles = result.files || result; // Support both formats

          // Ensure we have src/App.tsx
          if (!newFiles['src/App.tsx']) {
            throw new Error('No src/App.tsx in response');
          }

          const mergedFiles = { ...files, ...newFiles };
          const fileChanges = calculateFileChanges(files, mergedFiles);

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
          console.error('Parse error:', e, text);
          const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            timestamp: Date.now(),
            error: 'Failed to generate project. Please try again.',
            snapshotFiles: { ...files }
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      }
    } catch (error) {
      console.error('Error generating content:', error);
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
    }
  };

  const handleRevert = (messageId: string) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.snapshotFiles) {
      reviewChange(`Revert to earlier state`, message.snapshotFiles);
    }
  };

  const handleReset = () => {
    setMessages([]);
    resetApp();
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
          onClick={handleReset}
          className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
          title="Clear All & Reset"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Chat Messages */}
      <ChatPanel
        messages={messages}
        onRevert={handleRevert}
        isGenerating={isGenerating}
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
      />

      {/* Settings Panel */}
      <SettingsPanel
        isEducationMode={isEducationMode}
        onEducationModeChange={setIsEducationMode}
        hasApiKey={!!process.env.API_KEY}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
      />
    </aside>
  );
};
