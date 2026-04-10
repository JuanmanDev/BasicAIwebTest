/**
 * AI & LiteLLM Integration
 * Universal gateway for multiple LLM providers with tracing
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, generateText, type Message, type CoreMessage } from 'ai';
import type { McpServer } from '~/lib/schema';

export interface AIProviderConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'openrouter' | 'litellm';
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  onToolCall?: (toolCall: { name: string; args: Record<string, unknown> }) => void;
  onReasoning?: (reasoning: string) => void;
  onComplete?: (result: { text: string; toolCalls: unknown[]; usage: unknown }) => void;
  onError?: (error: Error) => void;
}

export class AIService {
  private config: AIProviderConfig;

  constructor(config: AIProviderConfig) {
    this.config = config;
  }

  private getProvider() {
    const { provider, apiKey, baseUrl } = this.config;

    switch (provider) {
      case 'openai':
        return createOpenAI({ apiKey, baseURL: baseUrl });
      case 'anthropic':
        return createAnthropic({ apiKey });
      case 'google':
        const google = createGoogleGenerativeAI({ apiKey });
        return google;
      case 'litellm':
      case 'openrouter':
      default:
        // LiteLLM acts as a universal proxy
        return createOpenAI({
          apiKey: apiKey || 'sk-no-key-required',
          baseURL: baseUrl || 'http://localhost:4000',
        });
    }
  }

  async chat(
    messages: Message[],
    options: {
      tools?: ToolDefinition[];
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      callbacks?: StreamCallbacks;
    } = {}
  ) {
    const provider = this.getProvider();
    const { tools, systemPrompt, temperature = 0.7, maxTokens = 2048, callbacks } = options;

    // Convert messages to CoreMessage format
    const coreMessages: CoreMessage[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Add system prompt if provided
    if (systemPrompt) {
      coreMessages.unshift({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert tools to AI SDK format
    const aiTools = tools?.reduce(
      (acc, tool) => ({
        ...acc,
        [tool.name]: {
          description: tool.description,
          parameters: tool.parameters,
          execute: tool.execute,
        },
      }),
      {} as Record<string, { description: string; parameters: Record<string, unknown>; execute: (args: Record<string, unknown>) => Promise<unknown> }>
    );

    try {
      const result = await streamText({
        model: provider(this.config.model),
        messages: coreMessages,
        tools: aiTools,
        temperature,
        maxTokens,
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'ai-chat',
          metadata: {
            provider: this.config.provider,
            model: this.config.model,
          },
        },
        onFinish: (event) => {
          callbacks?.onComplete?.({
            text: event.text,
            toolCalls: event.toolCalls,
            usage: event.usage,
          });
        },
      });

      // Handle streaming
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          callbacks?.onChunk?.(chunk.textDelta);
        } else if (chunk.type === 'tool-call') {
          callbacks?.onToolCall?.({
            name: chunk.toolName,
            args: chunk.args as Record<string, unknown>,
          });
        } else if (chunk.type === 'reasoning') {
          callbacks?.onReasoning?.(chunk.textDelta);
        }
      }

      return result;
    } catch (error) {
      console.error('AI chat error:', error);
      callbacks?.onError?.(error as Error);
      throw error;
    }
  }

  async generate(prompt: string, options: { systemPrompt?: string; temperature?: number } = {}) {
    const provider = this.getProvider();
    const { systemPrompt, temperature = 0.7 } = options;

    const messages: CoreMessage[] = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      { role: 'user' as const, content: prompt },
    ];

    const result = await generateText({
      model: provider(this.config.model),
      messages,
      temperature,
    });

    return result.text;
  }

  /**
   * Parse reasoning/thinking models output
   * Some models like o1, DeepSeek R1 include internal reasoning
   */
  parseReasoningOutput(content: string): { reasoning?: string; answer: string } {
    // Common patterns for reasoning models
    const thinkPatterns = [
      /<think>([\s\S]*?)<\/think>/i,
      /<think>([\s\S]*?)<\/think>/i,
      /\[THOUGHT\]([\s\S]*?)\[\/THOUGHT\]/i,
      /Reasoning:([\s\S]*?)(?:Answer:|Conclusion:|$)/i,
    ];

    for (const pattern of thinkPatterns) {
      const match = content.match(pattern);
      if (match) {
        const reasoning = match[1].trim();
        const answer = content.replace(pattern, '').trim();
        return { reasoning, answer };
      }
    }

    return { answer: content };
  }
}

/**
 * Create AI service from runtime config
 */
export function createAIService() {
  const config = useRuntimeConfig();
  
  return new AIService({
    provider: 'litellm',
    model: process.env.LITELLM_DEFAULT_MODEL || 'gpt-4o',
    apiKey: config.liteLlmApiKey,
    baseUrl: config.liteLlmBaseUrl,
  });
}

/**
 * Convert MCP tools to AI SDK tool definitions
 */
export function mcpToolsToAIServiceTools(mcpServers: McpServer[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  for (const server of mcpServers) {
    if (!server.tools || server.status !== 'active') continue;

    for (const tool of server.tools) {
      tools.push({
        name: `${server.name}_${tool.name}`,
        description: tool.aiGeneratedDescription || tool.description,
        parameters: tool.inputSchema,
        execute: async (args: Record<string, unknown>) => {
          // This will be implemented in the MCP service
          const { callMcpTool } = await import('~/lib/mcp/client');
          return callMcpTool(server.id, tool.name, args);
        },
      });
    }
  }

  return tools;
}
