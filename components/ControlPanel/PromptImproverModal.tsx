import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  Loader2,
  Check,
  Send,
  Wand2,
  User,
  Bot,
  FileCode,
  RefreshCw,
  Copy,
  MessageSquare
} from 'lucide-react';
import { FileSystem } from '../../types';
import { getProviderManager } from '../../services/ai';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFinalPrompt?: boolean;
}

interface PromptImproverModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalPrompt: string;
  files: FileSystem;
  hasExistingApp: boolean;
  onAccept: (improvedPrompt: string) => void;
}

// System instruction for the prompt engineering assistant
const PROMPT_ENGINEER_SYSTEM = `You are an expert Prompt Engineering Assistant helping users craft better prompts for UI/UX code generation.

## Your Role
You help users improve their prompts through conversation. Ask clarifying questions to understand exactly what they want, then generate an optimized prompt.

## Conversation Flow
1. First, analyze their initial prompt and the project context
2. Ask 2-3 focused, specific questions to clarify their needs (don't ask too many at once)
3. Based on their answers, either ask follow-up questions OR generate the final prompt
4. When you have enough information, generate the final improved prompt

## Question Guidelines
- Ask about specific UI elements they want (layout, colors, animations)
- Ask about user interactions and states (hover, loading, error)
- Ask about responsive behavior if relevant
- Ask about data/content if the component handles dynamic data
- Keep questions short and easy to answer

## Final Prompt Guidelines
When generating the final prompt, make it:
- Specific and actionable
- Include technical details gathered from conversation
- Mention accessibility if appropriate
- Include responsive behavior if discussed
- Keep it natural, not like a spec document

## Response Format
- For questions: Just ask naturally, one message at a time
- For final prompt: Start with "Here's your improved prompt:" followed by the prompt in a code block

## Important
- Be conversational and friendly
- Don't overwhelm with too many questions
- 2-4 exchanges is usually enough
- When ready, generate the final prompt confidently
- The final prompt should be usable as-is for code generation`;

export const PromptImproverModal: React.FC<PromptImproverModalProps> = ({
  isOpen,
  onClose,
  originalPrompt,
  files,
  hasExistingApp,
  onAccept
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Generate project context summary
  const getProjectContext = () => {
    const fileList = Object.keys(files);
    if (fileList.length === 0) return 'New project (no existing files)';

    const components = fileList.filter(f => f.includes('/components/') || f.endsWith('.tsx'));
    const styles = fileList.filter(f => f.endsWith('.css'));
    const hasTypeScript = fileList.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    // Get a sample of component names
    const componentNames = components.slice(0, 8).map(c => {
      const parts = c.split('/');
      return parts[parts.length - 1].replace(/\.(tsx?|jsx?)$/, '');
    });

    return `Project: ${fileList.length} files, ${components.length} components (${componentNames.join(', ')}${components.length > 8 ? '...' : ''}), ${hasTypeScript ? 'TypeScript' : 'JavaScript'}, React + Tailwind CSS`;
  };

  // Build conversation history for AI
  const buildConversationHistory = (msgs: Message[]) => {
    return msgs.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));
  };

  // Send message to AI
  const sendToAI = async (userMessage?: string) => {
    setIsLoading(true);

    try {
      const manager = getProviderManager();
      const provider = manager.getProvider();
      const config = manager.getActiveConfig();

      if (!provider || !config) {
        throw new Error('No AI provider configured');
      }

      // Build messages array for context
      const currentMessages = userMessage
        ? [...messages, { id: crypto.randomUUID(), role: 'user' as const, content: userMessage, timestamp: Date.now() }]
        : messages;

      // Build the full prompt with conversation history
      const projectContext = getProjectContext();
      const taskType = hasExistingApp ? 'modifying an existing app' : 'creating a new app';

      // Build conversation history as text
      const historyText = currentMessages
        .filter(m => m.content)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n');

      // Build the prompt
      let prompt = '';
      if (currentMessages.length === 0 || (currentMessages.length === 1 && !userMessage)) {
        // First message - include original prompt and context
        prompt = `## Project Context
${projectContext}

## Task Type
User is ${taskType}

## User's Initial Prompt
"${originalPrompt}"

Please analyze this prompt and ask clarifying questions to help improve it. Start by acknowledging what you understand, then ask 2-3 specific questions.`;
      } else {
        // Subsequent messages - include conversation history
        prompt = `## Project Context
${projectContext}

## Task Type
User is ${taskType}

## Original Prompt
"${originalPrompt}"

## Conversation So Far
${historyText}

Continue the conversation naturally. Either ask follow-up questions or if you have enough information, generate the final improved prompt.`;
      }

      // Add user message to state if provided
      if (userMessage) {
        const newUserMessage: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: userMessage,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, newUserMessage]);
      }

      // Create assistant message placeholder
      const assistantMessageId = crypto.randomUUID();
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);

      let fullResponse = '';

      // Use streaming for real-time response
      await provider.generateStream(
        {
          prompt,
          systemInstruction: PROMPT_ENGINEER_SYSTEM,
          stream: true
        },
        config.defaultModel,
        (chunk) => {
          fullResponse += chunk.text;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, content: fullResponse }
                : m
            )
          );
        }
      );

      // Check if this response contains a final prompt
      const finalPromptMatch = fullResponse.match(/```(?:text|prompt)?\n?([\s\S]*?)```/);
      if (fullResponse.includes("Here's your improved prompt") && finalPromptMatch) {
        const extractedPrompt = finalPromptMatch[1].trim();
        setFinalPrompt(extractedPrompt);
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId
              ? { ...m, isFinalPrompt: true }
              : m
          )
        );
      }

    } catch (err) {
      console.error('[PromptImprover] Error:', err);
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev.filter(m => m.content !== ''), errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Start conversation when modal opens
  useEffect(() => {
    if (isOpen && originalPrompt.trim() && messages.length === 0) {
      sendToAI();
    }
  }, [isOpen, originalPrompt]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setInputValue('');
      setFinalPrompt(null);
    }
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when not loading
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    sendToAI(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async () => {
    if (!finalPrompt) return;
    try {
      await navigator.clipboard.writeText(finalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleAccept = () => {
    if (finalPrompt) {
      onAccept(finalPrompt);
      onClose();
    }
  };

  const handleRestart = () => {
    setMessages([]);
    setFinalPrompt(null);
    setTimeout(() => sendToAI(), 100);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-3xl h-[80vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-xl">
              <Wand2 className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="font-medium text-lg flex items-center gap-2">
                Prompt Engineer
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded-full">AI</span>
              </h2>
              <p className="text-xs text-slate-500">Chat to craft the perfect prompt</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Start over"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Original Prompt Banner */}
        <div className="px-4 py-2 bg-slate-800/50 border-b border-white/5">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs text-slate-500">Original prompt:</span>
            <span className="text-xs text-slate-400 truncate flex-1">{originalPrompt}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                message.role === 'user'
                  ? 'bg-blue-600/20 text-blue-400'
                  : 'bg-purple-600/20 text-purple-400'
              }`}>
                {message.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Content */}
              <div className={`flex-1 min-w-0 ${message.role === 'user' ? 'text-right' : ''}`}>
                <div className={`inline-block max-w-[85%] text-left rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600/20 border border-blue-500/20 rounded-tr-sm'
                    : 'bg-slate-800/50 border border-white/5 rounded-tl-sm'
                }`}>
                  {message.content ? (
                    <div className="text-sm text-slate-200 whitespace-pre-wrap">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-purple-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  )}
                </div>

                {/* Final Prompt Actions */}
                {message.isFinalPrompt && finalPrompt && (
                  <div className="mt-3 flex items-center gap-2 justify-start">
                    <button
                      onClick={handleAccept}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      Use This Prompt
                    </button>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg text-sm transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && messages.length > 0 && messages[messages.length - 1].content === '' && (
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Sparkles className="w-4 h-4 animate-pulse text-purple-400" />
              <span>Analyzing...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/10 bg-slate-900/50">
          {/* Project context badge */}
          <div className="flex items-center gap-2 mb-3">
            <FileCode className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500">{getProjectContext()}</span>
          </div>

          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={finalPrompt ? "Ask for changes or accept the prompt..." : "Answer the questions..."}
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-slate-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 resize-none disabled:opacity-50"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim()}
              className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Hint */}
          <p className="text-[10px] text-slate-600 mt-2 text-center">
            {finalPrompt
              ? 'Click "Use This Prompt" to apply, or continue chatting to refine'
              : 'Answer questions to help craft the perfect prompt'}
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default PromptImproverModal;
