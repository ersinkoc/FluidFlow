import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send, Wand2, FileCode, Loader2, Check, Copy, Sparkles, MessageSquare, Zap
} from 'lucide-react';
import { FileSystem } from '../../types';
import { getProviderManager } from '../../services/ai';
import { getContextManager, CONTEXT_IDS } from '../../services/conversationContext';
import { getFluidFlowConfig } from '../../services/fluidflowConfig';
import { ensureTokenSpace, checkAndAutoCompact } from '../../services/contextCompaction';
import { ContextIndicator } from '../ContextIndicator';
import { PROMPT_ENGINEER_SYSTEM } from './prompts';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isFinalPrompt?: boolean;
  // Token usage information
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  // Model and provider info
  model?: string;
  provider?: string;
  generationTime?: number; // in ms
  questionOptions?: QuestionOptions;
  selectedOptions?: string[];
  customAnswer?: string;
}

interface QuestionOptions {
  question: string;
  options: Option[];
  customOption?: boolean;
  allowCustom?: boolean;
  customPlaceholder?: string;
  required?: boolean;
  allowMultiple?: boolean;
}

// Response type for final prompt generation
interface FinalPromptResponse {
  isFinalPrompt: true;
  finalPrompt: string;
}

// Union type for parsed JSON from AI response
type AIResponseData = QuestionOptions | FinalPromptResponse;

interface Option {
  id: string;
  text: string;
  description?: string;
}

interface PromptImproverModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalPrompt: string;
  files: FileSystem;
  hasExistingApp: boolean;
  onAccept: (improvedPrompt: string) => void;
}

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
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextManager = getContextManager();
  const fluidflowConfig = getFluidFlowConfig();
  const sessionIdRef = useRef<string>(`${CONTEXT_IDS.PROMPT_IMPROVER}-${Date.now()}`);

  // Generate intelligent project context analysis
  const getProjectContext = () => {
    const fileList = Object.keys(files);
    if (fileList.length === 0) return 'New project (no existing files)';

    const components = fileList.filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));
    const pages = fileList.filter(f => f.includes('/pages/') || f.includes('/routes/'));
    const hooks = fileList.filter(f => f.includes('/hooks/') || f.includes('use'));
    const services = fileList.filter(f => f.includes('/services/') || f.includes('/api/'));
    const hasTypeScript = fileList.some(f => f.endsWith('.ts') || f.endsWith('.tsx'));

    // Analyze component patterns
    const componentNames = components.map(c => {
      const parts = c.split('/');
      return parts[parts.length - 1].replace(/\.(tsx?|jsx?)$/, '');
    });

    // Identify project type based on files
    let projectType = 'React application';
    if (pages.length > 0) projectType = 'Multi-page React app';
    if (services.length > 0) projectType = 'Full-stack React application';
    if (fileList.some(f => f.includes('store') || f.includes('redux'))) projectType = 'State-managed React app';

    return `${projectType}: ${fileList.length} files, ${components.length} components (${componentNames.slice(0, 5).join(', ')}${components.length > 5 ? '...' : ''}), ${hasTypeScript ? 'TypeScript' : 'JavaScript'}, ${services.length > 0 ? 'with backend services' : 'frontend only'}, ${hooks.length > 0 ? 'custom hooks present' : 'no custom hooks'}`;
  };

  // Clean up old prompt improver contexts
  const cleanupOldPromptImproverContexts = () => {
    const allContexts = contextManager.listContexts();
    const promptImproverContexts = allContexts.filter(ctx =>
      ctx.id.startsWith(CONTEXT_IDS.PROMPT_IMPROVER) && ctx.id !== sessionIdRef.current
    );

    // Delete old contexts to keep storage clean
    promptImproverContexts.forEach(ctx => {
      contextManager.deleteContext(ctx.id);
    });
  };

  // Handle context compaction
  const handleCompaction = async () => {
    const sessionId = sessionIdRef.current;
    const manager = getProviderManager();
    const provider = manager.getProvider();
    const config = manager.getActiveConfig();

    if (!provider || !config) {
      throw new Error('No AI provider configured');
    }

    const beforeStats = contextManager.getStats(sessionId);

    // Use AI to summarize the conversation
    await contextManager.compactContext(sessionId, async (text) => {
      const response = await provider.generate(
        {
          prompt: `Summarize this conversation concisely, preserving key decisions and context:\n\n${text}`,
          systemInstruction: 'You are a summarization assistant. Create a brief summary that captures the essential points of the conversation.',
          maxTokens: 500
        },
        config.defaultModel
      );
      return response.text;
    });

    const afterStats = contextManager.getStats(sessionId);

    // Log the compaction
    if (beforeStats && afterStats) {
      fluidflowConfig.addCompactionLog({
        contextId: sessionId,
        beforeTokens: beforeStats.tokens,
        afterTokens: afterStats.tokens,
        messagesSummarized: beforeStats.messages - afterStats.messages + 1, // +1 for summary
        summary: `Compacted ${beforeStats.messages} messages to ${afterStats.messages}`
      });
    }
  };

  // Send message to AI
  const sendToAI = async (userMessage?: string) => {
    setIsLoading(true);
    const sessionId = sessionIdRef.current;

    try {
      const manager = getProviderManager();
      const provider = manager.getProvider();
      const config = manager.getActiveConfig();

      if (!provider || !config) {
        throw new Error('No AI provider configured');
      }

      // Add user message if provided
      if (userMessage) {
        const userMsg: Message = {
          id: crypto.randomUUID(),
          role: 'user',
          content: userMessage,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, userMsg]);
        contextManager.addMessage(sessionId, 'user', userMessage);

        // Clear selections when user responds
        setSelectedOptions([]);
        setCustomInput('');
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

      // Add placeholder to context
      contextManager.addMessage(sessionId, 'assistant', '');

      // Build context for AI
      const contextMessages = contextManager.getMessagesForAI(sessionId);
      const _historyText = contextMessages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      let prompt = '';
      if (messages.length === 0) {
        // Initial prompt with enhanced context analysis
        prompt = `I need help improving this prompt for generating a React application:

Original prompt: "${originalPrompt}"

Project context: ${getProjectContext()}
Existing app: ${hasExistingApp ? 'Yes - improving/modifying existing' : 'No - creating from scratch'}

Please analyze this prompt and project structure, then ask questions in JSON format (maximum 3) to clarify their needs.

After asking exactly 3 questions total, you MUST provide the final improved prompt. No more questions after 3.`;
      } else {
        // Count current questions asked (only questions with questionOptions)
        const questionMessages = messages.filter((m: Message) => m.questionOptions);
        const currentQuestionCount = questionMessages.length;

        // Follow-up prompt with strict question limit
        if (currentQuestionCount >= 2) {
          prompt = `${userMessage || 'Please continue the conversation.'}

CRITICAL: You have already asked ${currentQuestionCount} questions. This MUST be your last question. After this response, you MUST provide the final improved prompt. Maximum 3 questions total - no exceptions!

Ask ONE final question if needed, then provide the improved prompt. Do NOT give multiple choice options.`;
        } else {
          prompt = `${userMessage || 'Please continue the conversation.'}

Remember: Maximum 3 questions total. You have asked ${currentQuestionCount} question(s) so far. Ask only 1-${3 - currentQuestionCount} more questions.

Ask direct questions without providing options or checkboxes. Let users respond naturally.`;
        }
      }

      // Check token space before sending
      const estimatedTokens = Math.ceil(prompt.length / 4) + 500; // Rough estimate
      const spaceCheck = await ensureTokenSpace(sessionId, estimatedTokens);

      if (!spaceCheck.canProceed) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          content: spaceCheck.reason || 'Insufficient token space. Please compact the context.',
        }]);
        setIsLoading(false);
        return;
      }

      if (spaceCheck.compacted) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          timestamp: Date.now(),
          content: `📦 Context auto-compacted to make space for your request.`,
        }]);
      }

      let fullResponse = '';
      const _startTime = Date.now();

      // Use streaming for real-time response
      const _streamResponse = await provider.generateStream(
        {
          prompt,
          systemInstruction: PROMPT_ENGINEER_SYSTEM,
          stream: true
        },
        config.defaultModel,
        (chunk) => {
          fullResponse += chunk.text;

          // Check for JSON content in streaming and clean it for display only
          let displayContent = fullResponse;

          // Try multiple JSON patterns to detect early, but only clean for display
          const jsonPatterns = [
            /```json\n?([\s\S]*?)\n?```/,
            /\{[\s\S]*"question"[\s\S]*"options"[\s\S]*\}/,
            /\{[^{]*"question"[^}]*\}/
          ];

          const hasJsonContent = jsonPatterns.some(pattern => pattern.test(displayContent));

          if (hasJsonContent) {
            // Clean content by removing any JSON-like structures for display only
            displayContent = displayContent
              .replace(/```json\n?[\s\S]*?\n?```/g, '')
              .replace(/\{[\s\S]*"question"[\s\S]*"options"[\s\S]*\}/g, '')
              .replace(/\{[^{]*"question"[^}]*\}/g, '')
              .trim();
          }

          // Update context manager with full response (preserve JSON for parsing)
          contextManager.updateLastMessage(sessionId, fullResponse);

          // But display only cleaned content
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: displayContent,
                    generationTime: Date.now() - _startTime,
                    model: config.defaultModel,
                    provider: config.name
                  }
                : m
            )
          );
        }
      );

      // Finalize the message in context
      contextManager.finalizeMessage(sessionId);

      // Check for JSON questions FIRST before checking for final prompts
      let jsonMatch = fullResponse.match(/```json\n?([\s\S]*?)\n?```/);

      // If no proper JSON block, try to find JSON-like structure
      if (!jsonMatch) {
        jsonMatch = fullResponse.match(/\{[\s\S]*"question"[\s\S]*"options"[\s\S]*\}/);
      }

      // Also try to find JSON between quotes and braces
      if (!jsonMatch) {
        const braceMatch = fullResponse.match(/\{[^{]*"question"[^}]*\}/);
        if (braceMatch) {
          jsonMatch = [null, braceMatch[0]];
        }
      }

      // If we found JSON questions, process them first
      if (jsonMatch) {
        console.log('[PromptImprover] Processing JSON questions first');
        try {
          let jsonString = jsonMatch[1] || jsonMatch[0];

          // Clean up the JSON string - remove markdown formatting
          jsonString = jsonString
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

          console.log('[PromptImprover] Found JSON-like structure:', jsonString.substring(0, 200));

          // Prevent recursion by limiting JSON size
          if (jsonString.length > 10000) {
            console.warn('JSON question too large, skipping');
            throw new Error('JSON too large');
          }

          const questionData = JSON.parse(jsonString) as AIResponseData;

          // Check if this is a final prompt response (type guard)
          if ('isFinalPrompt' in questionData && 'finalPrompt' in questionData) {
            // This is the final prompt - display it
            setFinalPrompt(questionData.finalPrompt);
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, isFinalPrompt: true, content: "Final prompt generated successfully!" }
                  : m
              )
            );
            return;
          }

          // Otherwise validate as question data structure
          const questionOptions = questionData as QuestionOptions;
          if (!questionOptions.question || !Array.isArray(questionOptions.options)) {
            throw new Error('Invalid question structure');
          }

          // Limit options to prevent UI issues
          if (questionOptions.options.length > 10) {
            questionOptions.options = questionOptions.options.slice(0, 10);
          }

          setSelectedOptions([]);
          setCustomInput('');

          // Update message with question options, but hide the JSON from display
          setMessages(prev =>
            prev.map((m: Message) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    questionOptions: questionOptions,
                    // Clean the content to remove JSON-like structures but keep question text
                    content: fullResponse
                      .replace(/```json\n?[\s\S]*?\n?```/g, '') // Remove proper JSON blocks
                      .replace(/\{[\s\S]*"question"[\s\S]*"options"[\s\S]*\}/g, '') // Remove JSON-like structures
                      .replace(/\{[^{]*"question"[^}]*\}/g, '') // Remove simple JSON objects
                      .replace(/Here's your improved prompt:[\s\S]*$/g, '') // Remove final prompt part
                      .trim()
                  }
                : m
            )
          );
        } catch (e) {
          console.error('Failed to parse JSON question:', e);
          // Continue with final prompt checking
        }
      } else {
        // No JSON found, check if this response contains a final prompt - use multiple patterns
        console.log('[PromptImprover] No JSON found, checking for final prompt');
        const finalPromptPatterns = [
          /```(?:text|prompt|markdown)?\n?([\s\S]*?)\n?```/g, // Code blocks with various languages
          /(?:improved|final|here is|here's)?\s*(?:your)?\s*prompt:?\s*([\s\S]*?)(?=\n\n|\n|$)/gi, // Text prompts with various prefixes
          /(?:prompt\s*:|final\s*response:)\s*([\s\S]*?)(?=\n\n|\n|$)/gi, // Explicit prompt/response labels
        ];

        let finalPromptMatch = null;
        for (const pattern of finalPromptPatterns) {
          const matches = fullResponse.match(pattern);
          if (matches && matches[1] && matches[1].trim().length > 50) {
            finalPromptMatch = matches;
            break;
          }
        }

        // Also check for keywords that suggest final prompt
        const finalPromptKeywords = [
          "Here's your improved prompt",
          "Here is your improved prompt",
          "Here's your final prompt",
          "Here is your final prompt",
          "Your improved prompt:",
          "Your final prompt:",
          "Here's the improved prompt:",
          "Here's the final prompt:",
          "Final prompt:",
          "Improved prompt:"
        ];

        const hasFinalKeyword = finalPromptKeywords.some(keyword =>
          fullResponse.toLowerCase().includes(keyword.toLowerCase())
        );

        // Enforce 3 question maximum - force final prompt if limit reached
        // Count only questions (messages with questionOptions)
        const questionMsgs = messages.filter((m: Message) => m.questionOptions);
        const hasReachedQuestionLimit = questionMsgs.length >= 3;

        if (hasReachedQuestionLimit || (finalPromptMatch && finalPromptMatch[1].trim().length > 50) || hasFinalKeyword) {
          let extractedPrompt = '';

          // Force final prompt if question limit reached
          if (hasReachedQuestionLimit && !hasFinalKeyword && (!finalPromptMatch || finalPromptMatch[1].trim().length <= 50)) {
            // Generate final prompt from conversation context
            const conversationContext = messages
              .filter((m: Message) => m.role === 'user')
              .map((m: Message) => m.content)
              .join('\n');

            extractedPrompt = `Based on our conversation about: "${originalPrompt}"

${conversationContext ? `User responses: ${conversationContext}` : ''}

Create an improved prompt that:
- Addresses the user's specific needs revealed in our conversation
- Incorporates their project context: ${getProjectContext()}
- Includes specific details they mentioned
- Follows their existing project patterns and technology choices
- Is clear, specific, and actionable for React component generation`;

            console.log('[PromptImprover] Forced final prompt generation due to 3-question limit');
          } else {
            if (finalPromptMatch && finalPromptMatch[1]) {
              extractedPrompt = finalPromptMatch[1].trim();
            } else {
              // If no code block found but keyword found, extract text after keyword
              for (const keyword of finalPromptKeywords) {
                const regex = new RegExp(`(?:${keyword})[\\s:]*([\\s\\S]*?)(?=\\n\\n|\\n|$)`, 'gi');
                const match = fullResponse.match(regex);
                if (match && match[1] && match[1].trim().length > 50) {
                  extractedPrompt = match[1].trim();
                  break;
                }
              }
            }
          }

          if (extractedPrompt && extractedPrompt.length > 50) {
            console.log('[PromptImprover] Final prompt detected:', extractedPrompt.substring(0, 100));
            setFinalPrompt(extractedPrompt);
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessageId
                  ? { ...m, isFinalPrompt: true }
                  : m
              )
            );
          }
        } else {
          // Create regular assistant message (question)
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: fullResponse,
            timestamp: Date.now()
          };

          setMessages(prev => [...prev, assistantMessage]);
        }

        // Check if context needs compaction and trigger based on settings
        const compactionResult = await checkAndAutoCompact(sessionId);
        if (compactionResult) {
          if (compactionResult.compacted) {
            console.log('[PromptImprover] Context compacted:', compactionResult);
            // Show notification to user
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: `📦 Context compacted: ${compactionResult.beforeTokens.toLocaleString()} → ${compactionResult.afterTokens.toLocaleString()} tokens`,
              timestamp: Date.now()
            }]);
          } else if (!getFluidFlowConfig().getContextSettings().autoCompact) {
            // Auto-compact is off, show prompt to user
            console.log('[PromptImprover] Context needs compaction, awaiting user action');
          }
        }
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

  // Handle option selection
  const handleOptionSelect = (optionId: string) => {
    // Find the LAST message with question options (most recent question)
    const questionMessage = [...messages].reverse().find(m => m.questionOptions);
    if (!questionMessage || !questionMessage.questionOptions) return;

    if (questionMessage.questionOptions.allowMultiple) {
      setSelectedOptions(prev =>
        prev.includes(optionId)
          ? prev.filter(id => id !== optionId)
          : [...prev, optionId]
      );
    } else {
      setSelectedOptions([optionId]);
    }
  };

  // Handle question submit
  const handleQuestionSubmit = () => {
    // Find the LAST message with question options (most recent question)
    const questionMessage = [...messages].reverse().find(m => m.questionOptions);
    if (!questionMessage || !questionMessage.questionOptions) return;

    // Validate if question is required
    if (questionMessage.questionOptions.required && selectedOptions.length === 0 && !customInput.trim()) {
      return;
    }

    // Build response text
    let responseText = '';

    // Add selected options
    if (selectedOptions.length > 0) {
      const selectedTexts = selectedOptions.map(id => {
        const option = questionMessage.questionOptions.options.find((opt: Option) => opt.id === id);
        return option ? option.text : '';
      }).filter(Boolean);

      responseText = selectedTexts.join(', ');
    }

    // Add custom input if provided
    if (customInput.trim()) {
      if (responseText) {
        responseText += `. Custom: ${customInput.trim()}`;
      } else {
        responseText = customInput.trim();
      }
    }

    if (responseText.trim()) {
      // Clear selections before sending response
      setSelectedOptions([]);
      setCustomInput('');

      // Send response to AI
      sendToAI(responseText);
    }
  };

  // Start conversation when modal opens
  useEffect(() => {
    if (isOpen && originalPrompt.trim() && messages.length === 0) {
      // Clean up old prompt improver contexts before starting new session
      cleanupOldPromptImproverContexts();
      sendToAI();
    }
    // Note: messages.length check prevents infinite loop, other deps are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, originalPrompt]);

  // Reset when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Clean up the current session context
      contextManager.deleteContext(sessionIdRef.current);
      setMessages([]);
      setInputValue('');
      setFinalPrompt(null);
      setSelectedOptions([]);
      setCustomInput('');
    }
    // Note: contextManager is a singleton
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when not loading
  useEffect(() => {
    if (!isLoading && inputRef.current && !messages.some(m => m.questionOptions)) {
      inputRef.current.focus();
    }
  }, [isLoading, messages]);

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
    // Clear context and start fresh with new session
    contextManager.clearContext(sessionIdRef.current);
    sessionIdRef.current = `${CONTEXT_IDS.PROMPT_IMPROVER}-${Date.now()}`;
    setMessages([]);
    setFinalPrompt(null);
    setSelectedOptions([]);
    setCustomInput('');
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
              <p className="text-xs text-slate-500">Interactive prompt improvement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              title="Restart conversation"
            >
              <MessageSquare className="w-4 h-4 text-slate-400" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => {
            // Check if this is the latest UNANSWERED message with questionOptions
            const isLatestQuestion = message.questionOptions &&
              [...messages].reverse().findIndex(m => m.questionOptions) === messages.length - 1 - index &&
              // Check if there's no user message after this question
              !messages.slice(index + 1).some((m: Message) => m.role === 'user');

            return (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${message.role === 'user' ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`p-3 rounded-xl ${
                      message.role === 'user'
                        ? 'bg-blue-500/20 text-blue-100 border border-blue-500/30'
                        : 'bg-slate-800 text-slate-100 border border-white/5'
                    }`}
                  >
                    {message.questionOptions ? (
                    <div>
                      <p className="text-sm mb-3 whitespace-pre-wrap">{message.questionOptions.question}</p>

                      {/* Question Progress Indicator */}
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex-1 flex gap-1">
                          {[1, 2, 3].map((qNum) => (
                            <div
                              key={qNum}
                              className={`h-1.5 rounded-full flex-1 ${
                                qNum <= messages.filter(m => m.questionOptions).length
                                  ? 'bg-purple-500'
                                  : 'bg-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-slate-500">
                          {messages.filter(m => m.questionOptions).length}/3
                        </span>
                      </div>

                      {/* Interactive Options */}
                      <div className="space-y-2">
                        {message.questionOptions.options.map((option) => (
                          <div
                            key={option.id}
                            onClick={() => isLatestQuestion && handleOptionSelect(option.id)}
                            className={`p-3 rounded-lg border transition-all ${
                              (isLatestQuestion && selectedOptions.includes(option.id)) || (!isLatestQuestion && message.selectedOptions?.includes(option.id))
                                ? 'bg-purple-500/20 border-purple-500/50 text-purple-200'
                                : isLatestQuestion
                                  ? 'bg-slate-700/50 border-white/10 hover:bg-slate-700 hover:border-white/20 cursor-pointer'
                                  : 'bg-slate-800/30 border-slate-700/50 cursor-not-allowed opacity-60'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                                selectedOptions.includes(option.id)
                                  ? 'bg-purple-500 border-purple-500'
                                  : isLatestQuestion
                                    ? 'border-slate-400'
                                    : 'border-slate-600'
                              }`}>
                                {((isLatestQuestion && selectedOptions.includes(option.id)) || (!isLatestQuestion && message.selectedOptions?.includes(option.id))) && (
                                  <div className="w-full h-full rounded-full bg-white scale-50"></div>
                                )}
                              </div>
                              <div className="flex-1">
                                <p className={`text-sm font-medium ${!isLatestQuestion ? 'text-slate-500' : ''}`}>{option.text}</p>
                                {option.description && (
                                  <p className="text-xs text-slate-400 mt-1">{option.description}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Custom Option */}
                        {(message.questionOptions.allowCustom || message.questionOptions.customOption) && (
                          <div className="mt-3">
                            <textarea
                              value={isLatestQuestion ? customInput : (message.customAnswer || '')}
                              onChange={(e) => isLatestQuestion && setCustomInput(e.target.value)}
                              placeholder={message.questionOptions.customPlaceholder || "Enter custom response..."}
                              rows={2}
                              disabled={!isLatestQuestion}
                              className={`w-full p-3 border rounded-lg text-sm resize-none ${
                                isLatestQuestion
                                  ? 'bg-slate-700/50 border-white/10 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50'
                                  : 'bg-slate-800/30 border-slate-700/50 text-slate-500 cursor-not-allowed'
                              }`}
                            />
                          </div>
                        )}

                        {/* Submit Button for Question */}
                        {message.questionOptions && isLatestQuestion && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={handleQuestionSubmit}
                              disabled={message.questionOptions.required && selectedOptions.length === 0 && !customInput.trim()}
                              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:text-slate-400 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              Submit Response
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  )}

                  {/* Token Usage */}
                  {message.tokenUsage && message.role === 'assistant' && (
                    <div className="mt-3 p-2 bg-slate-800/30 rounded-lg border border-slate-700">
                      <div className="flex items-center justify-between mb-1">
                        <h5 className="text-xs font-medium text-slate-400 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-yellow-400" />
                          Tokens: {message.tokenUsage.totalTokens.toLocaleString()}
                        </h5>
                        {message.generationTime && (
                          <span className="text-xs text-slate-500">
                            {(message.generationTime / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-blue-400">In: {message.tokenUsage.inputTokens.toLocaleString()}</span>
                        <span className="text-green-400">Out: {message.tokenUsage.outputTokens.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  {/* Final Prompt Display */}
                  {message.isFinalPrompt && finalPrompt && (
                    <div className="mt-3">
                      <div className="bg-slate-800/50 rounded-lg p-4 border border-green-500/30">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-green-400">Final Improved Prompt</h4>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={handleCopy}
                              className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono bg-slate-900/50 p-3 rounded border border-slate-700 overflow-x-auto">
                          {finalPrompt}
                        </pre>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={handleAccept}
                          className="flex-1 items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Use This Prompt
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

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
          {/* Context stats and project info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] text-slate-500 truncate max-w-[200px]">{getProjectContext()}</span>
            </div>

            {/* Context Indicator - Click for detailed modal */}
            <ContextIndicator
              contextId={sessionIdRef.current}
              showLabel={true}
              onCompact={handleCompaction}
            />
          </div>

          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={finalPrompt ? "Ask for changes or accept the prompt..." : "Answer the questions..."}
              disabled={isLoading || messages.some(m => m.questionOptions)}
              rows={1}
              className="flex-1 bg-slate-800/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 resize-none disabled:opacity-50"
              style={{ minHeight: '48px', maxHeight: '120px' }}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !inputValue.trim() || messages.some(m => m.questionOptions)}
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
            {messages.some(m => m.questionOptions)
              ? 'Select options above or type a custom response'
              : finalPrompt
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