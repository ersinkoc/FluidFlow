/**
 * useChatState - Chat state management for ControlPanel
 *
 * Handles:
 * - Chat messages state
 * - Mode toggles (consultant, education)
 * - Message operations (revert, retry)
 */

import { useState, useCallback } from 'react';
import { ChatMessage, FileSystem } from '@/types';
import { getContextManager } from '@/services/conversationContext';

interface UseChatStateOptions {
  sessionId: string;
  resetApp: () => void;
}

export function useChatState({ sessionId, resetApp }: UseChatStateOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConsultantMode, setIsConsultantMode] = useState(false);
  const [isEducationMode, setIsEducationMode] = useState(false);

  // Handle reverting to a previous message's snapshot
  const handleRevert = useCallback((messageId: string, reviewChange: (label: string, files: FileSystem) => void) => {
    const message = messages.find(m => m.id === messageId);
    if (message?.snapshotFiles) {
      reviewChange('Revert to earlier state', message.snapshotFiles);
    }
  }, [messages]);

  // Handle retrying after an error
  const handleRetry = useCallback((
    errorMessageId: string,
    handleSend: (prompt: string, attachments: ChatMessage['attachments']) => void
  ) => {
    // Find the error message and the user message before it
    const errorIndex = messages.findIndex(m => m.id === errorMessageId);
    if (errorIndex < 1) return;

    const userMessage = messages[errorIndex - 1];
    if (userMessage.role !== 'user') return;

    // Remove the error message and user message from chat
    setMessages(prev => prev.filter((_, i) => i !== errorIndex && i !== errorIndex - 1));

    // Re-send the request
    handleSend(userMessage.prompt || '', userMessage.attachments || []);
  }, [messages]);

  // Handle reset confirmation
  const handleConfirmReset = useCallback(() => {
    const contextManager = getContextManager();
    setMessages([]);
    contextManager.clearContext(sessionId);
    resetApp();
  }, [sessionId, resetApp]);

  // Add a message to chat
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);

  // Toggle consultant mode
  const toggleConsultantMode = useCallback(() => {
    setIsConsultantMode(prev => !prev);
  }, []);

  // Toggle education mode
  const toggleEducationMode = useCallback(() => {
    setIsEducationMode(prev => !prev);
  }, []);

  return {
    messages,
    setMessages,
    isConsultantMode,
    setIsConsultantMode,
    toggleConsultantMode,
    isEducationMode,
    setIsEducationMode,
    toggleEducationMode,
    handleRevert,
    handleRetry,
    handleConfirmReset,
    addMessage,
  };
}
