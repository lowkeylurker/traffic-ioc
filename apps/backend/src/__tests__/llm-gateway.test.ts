import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LLMGateway, getLanguageModel } from '../rag/core/llm-gateway';

describe('LLMGateway', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('should initialize with default google provider when LLM_PROVIDER is not set', () => {
    delete process.env.LLM_PROVIDER;
    process.env.GEMINI_API_KEY = 'test-google-key';

    const gateway = new LLMGateway();
    expect(gateway.getProvider()).toBe('google');
    const model = gateway.getModel();
    expect(model).toBeDefined();
    expect(model.modelId).toContain('gemini');
  });

  it('should support ollama provider when configured via environment', () => {
    process.env.LLM_PROVIDER = 'ollama';
    process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
    process.env.OLLAMA_MODEL_NAME = 'qwen2.5:7b';

    const gateway = new LLMGateway();
    expect(gateway.getProvider()).toBe('ollama');
    const model = gateway.getModel();
    expect(model).toBeDefined();
    expect(model.modelId).toBe('qwen2.5:7b');
  });

  it('should allow explicit provider and model override in getLanguageModel', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const googleModel = getLanguageModel({ provider: 'google', model: 'gemini-1.5-flash' });
    expect(googleModel).toBeDefined();
    expect(googleModel.modelId).toBe('gemini-1.5-flash');

    const ollamaModel = getLanguageModel({ provider: 'ollama', model: 'qwen2.5:14b', baseUrl: 'http://localhost:11434/api' });
    expect(ollamaModel).toBeDefined();
    expect(ollamaModel.modelId).toBe('qwen2.5:14b');
  });

  it('should throw clear error if google provider is missing API key', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    const gateway = new LLMGateway({ provider: 'google' });
    expect(() => gateway.getModel()).toThrowError(/API key/i);
  });
});
