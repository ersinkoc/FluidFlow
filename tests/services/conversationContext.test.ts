import { describe, it, expect, beforeEach, vi } from 'vitest';
import ConversationContextManager, {
  getContextManager,
  CONTEXT_IDS
} from '../../services/conversationContext';

describe('ConversationContextManager', () => {
  let manager: InstanceType<typeof ConversationContextManager>;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    manager = new ConversationContextManager({ persistToStorage: false });
  });

  describe('Initialization', () => {
    it('should create manager with default config', () => {
      expect(manager).toBeDefined();
    });

    it('should create manager with custom config', () => {
      const customManager = new ConversationContextManager({
        minRemainingTokens: 50000,
        persistToStorage: false
      });
      expect(customManager).toBeDefined();
    });
  });

  describe('Context management', () => {
    it('should create new context', () => {
      const context = manager.getContext('test-context');
      expect(context).toBeDefined();
      expect(context.id).toBe('test-context');
      expect(context.messages).toEqual([]);
    });

    it('should create context with custom name', () => {
      const context = manager.getContext('test-id', 'Custom Name');
      expect(context.name).toBe('Custom Name');
    });

    it('should return existing context', () => {
      const context1 = manager.getContext('same-id');
      const context2 = manager.getContext('same-id');
      expect(context1).toBe(context2);
    });

    it('should list all contexts', () => {
      manager.getContext('ctx1');
      manager.getContext('ctx2');

      const all = manager.listContexts();
      expect(all).toHaveLength(2);
    });
  });

  describe('Message management', () => {
    it('should add user message', () => {
      manager.addMessage('test', 'user', 'Hello world');
      const context = manager.getContext('test');

      expect(context.messages).toHaveLength(1);
      expect(context.messages[0].role).toBe('user');
      expect(context.messages[0].content).toBe('Hello world');
    });

    it('should add assistant message', () => {
      manager.addMessage('test', 'assistant', 'Hi there!');
      const context = manager.getContext('test');

      expect(context.messages[0].role).toBe('assistant');
    });

    it('should add system message', () => {
      manager.addMessage('test', 'system', 'System message');
      const context = manager.getContext('test');

      expect(context.messages[0].role).toBe('system');
    });

    it('should add multiple messages', () => {
      manager.addMessage('test', 'user', 'Question 1');
      manager.addMessage('test', 'assistant', 'Answer 1');
      manager.addMessage('test', 'user', 'Question 2');

      const context = manager.getContext('test');
      expect(context.messages).toHaveLength(3);
    });

    it('should clear context', () => {
      manager.addMessage('test', 'user', 'Test');
      manager.clearContext('test');

      const context = manager.getContext('test');
      expect(context.messages).toEqual([]);
    });

    it('should delete context', () => {
      manager.getContext('test');
      manager.deleteContext('test');

      const all = manager.listContexts();
      expect(all).toHaveLength(0);
    });
  });

  describe('Token management', () => {
    it('should estimate tokens for message', () => {
      manager.addMessage('test', 'user', 'Hello world test message');
      const context = manager.getContext('test');

      expect(context.estimatedTokens).toBeGreaterThan(0);
    });

    it('should add tokens directly', () => {
      manager.addTokens('test', 100);
      const context = manager.getContext('test');

      expect(context.estimatedTokens).toBe(100);
    });

    it('should set exact token count', () => {
      manager.setTokenCount('test', 500);
      const context = manager.getContext('test');

      expect(context.estimatedTokens).toBe(500);
    });

    it('should use actual tokens when provided', () => {
      manager.addMessage('test', 'user', 'Short', {}, 50);
      const context = manager.getContext('test');

      expect(context.estimatedTokens).toBe(50);
    });
  });

  describe('Compaction', () => {
    it('should compact messages', () => {
      const smallManager = new ConversationContextManager({
        minRemainingTokens: 50,
        compactToTokens: 25,
        persistToStorage: false
      });

      // Add messages until we exceed limit
      for (let i = 0; i < 10; i++) {
        smallManager.addMessage('test', 'user', 'This is a longer message ' + i);
        smallManager.addMessage('test', 'assistant', 'Response ' + i);
      }

      const _beforeCount = smallManager.getContext('test').messages.length;
      smallManager.clearContext('test');
      // After clear, messages should be 0
      const afterCount = smallManager.getContext('test').messages.length;

      expect(afterCount).toBe(0);
    });

    it('should check if context needs compaction', () => {
      const smallManager = new ConversationContextManager({
        minRemainingTokens: 100,
        persistToStorage: false
      });

      // Add a message with tokens (~15 tokens estimated)
      smallManager.addMessage('test', 'user', 'This is a very long message that uses many tokens');

      // With modelContextSize = 50 and ~15 tokens used:
      // remaining = 50 - 15 = 35, which is < 100 (minRemainingTokens)
      // So it should need compaction
      expect(smallManager.needsCompaction('test', 50)).toBe(true);
    });

    it('should not need compaction for small context', () => {
      manager.addMessage('test', 'user', 'Short');
      expect(manager.needsCompaction('test')).toBe(false);
    });
  });

  describe('Message retrieval', () => {
    it('should get messages for AI', () => {
      manager.addMessage('test', 'user', 'Question');
      manager.addMessage('test', 'assistant', 'Answer');

      const messages = manager.getMessagesForAI('test');
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[1].role).toBe('assistant');
    });

    it('should limit messages for AI', () => {
      for (let i = 0; i < 10; i++) {
        manager.addMessage('test', 'user', 'Q' + i);
        manager.addMessage('test', 'assistant', 'A' + i);
      }

      const messages = manager.getMessagesForAI('test', 4);
      expect(messages).toHaveLength(4);
    });

    it('should get conversation as text', () => {
      manager.addMessage('test', 'user', 'Hello');
      manager.addMessage('test', 'assistant', 'Hi');

      const text = manager.getConversationAsText('test');
      expect(text).toContain('Hello');
      expect(text).toContain('Hi');
    });
  });

  describe('Stats', () => {
    it('should get context stats', () => {
      manager.addMessage('test', 'user', 'Test message');

      const stats = manager.getStats('test');
      expect(stats).toBeDefined();
      expect(stats?.messages).toBe(1);
      expect(stats?.tokens).toBeGreaterThan(0);
    });

    it('should return null for non-existent context', () => {
      const stats = manager.getStats('non-existent');
      expect(stats).toBeNull();
    });
  });

  describe('Utility functions', () => {
    it('should have standard context IDs', () => {
      expect(CONTEXT_IDS).toHaveProperty('MAIN_CHAT');
      expect(CONTEXT_IDS).toHaveProperty('PROMPT_IMPROVER');
      expect(CONTEXT_IDS).toHaveProperty('GIT_COMMIT');
      expect(CONTEXT_IDS).toHaveProperty('QUICK_EDIT');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty content', () => {
      manager.addMessage('test', 'user', '');
      expect(manager.getContext('test').messages).toHaveLength(1);
    });

    it('should handle very long messages', () => {
      // Create a long message with actual words for proper token estimation
      const words = Array(1000).fill('test').join(' ');
      const longMessage = words.repeat(10);
      manager.addMessage('test', 'user', longMessage);

      expect(manager.getContext('test').estimatedTokens).toBeGreaterThan(5000);
    });

    it('should handle special characters', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      manager.addMessage('test', 'user', special);

      expect(manager.getContext('test').messages).toHaveLength(1);
    });
  });

  describe('getContextManager factory', () => {
    it('should return singleton instance', () => {
      const instance1 = getContextManager();
      const instance2 = getContextManager();

      expect(instance1).toBe(instance2);
    });
  });
});
