import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider';
import { LanguageModelV1 } from 'ai';

export type LLMProviderType = 'google' | 'ollama';

export interface LLMGatewayOptions {
  provider?: LLMProviderType;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class LLMGateway {
  private provider: LLMProviderType;
  private modelName?: string;
  private apiKey?: string;
  private baseUrl?: string;

  constructor(options: LLMGatewayOptions = {}) {
    const defaultProvider = (process.env.LLM_PROVIDER as LLMProviderType) || 'google';
    this.provider = options.provider || defaultProvider;
    this.modelName = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
  }

  public getProvider(): LLMProviderType {
    return this.provider;
  }

  public getModel(providerOverride?: LLMProviderType, modelNameOverride?: string): LanguageModelV1 {
    const provider = providerOverride || this.provider;
    const model = modelNameOverride || this.modelName;

    if (provider === 'google') {
      const apiKey =
        this.apiKey ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      if (!apiKey) {
        throw new Error(
          'Missing Google Generative AI API key. Please set GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.'
        );
      }

      const google = createGoogleGenerativeAI({ apiKey });
      const targetModel = model || process.env.GOOGLE_MODEL_NAME || 'gemini-1.5-flash';
      return google(targetModel);
    }

    if (provider === 'ollama') {
      const baseUrl =
        this.baseUrl ||
        process.env.OLLAMA_BASE_URL ||
        'http://localhost:11434/api';

      const ollama = createOllama({ baseURL: baseUrl });
      const targetModel = model || process.env.OLLAMA_MODEL_NAME || 'qwen2.5:7b';
      return ollama(targetModel);
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

export function getLanguageModel(options: LLMGatewayOptions = {}): LanguageModelV1 {
  const gateway = new LLMGateway(options);
  return gateway.getModel(options.provider, options.model);
}

export const defaultLLMGateway = new LLMGateway();
export default defaultLLMGateway;
