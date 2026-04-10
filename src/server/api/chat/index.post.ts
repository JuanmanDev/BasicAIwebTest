/**
 * Chat API Endpoint
 * Handles AI chat with streaming, tool calling, and memory integration
 */

import { createAIService, mcpToolsToAIServiceTools } from '~/lib/ai/service';
import { getDb } from '~/lib/db';
import { conversations, messages } from '~/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { searchMemories } from '~/lib/memory/service';
import { getMcpManager } from '~/lib/mcp/client';
import type { Message } from 'ai';

export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, message: 'Method not allowed' });
  }

  const body = await readBody<{
    conversationId?: string;
    messages: Message[];
    model?: string;
    systemPrompt?: string;
    useMemory?: boolean;
    useTools?: boolean;
  }>(event);

  const { conversationId, messages: userMessages, model, systemPrompt, useMemory = true, useTools = true } = body;

  if (!userMessages || userMessages.length === 0) {
    throw createError({ statusCode: 400, message: 'Messages are required' });
  }

  const db = getDb();
  const config = useRuntimeConfig();
  
  // Get or create conversation
  let convId = conversationId;
  
  if (!convId) {
    // Create new conversation
    const lastMessage = userMessages[userMessages.length - 1];
    const title = lastMessage.content.substring(0, 50) + (lastMessage.content.length > 50 ? '...' : '');
    
    const [newConv] = await db.insert(conversations)
      .values({
        userId: 'user-id', // TODO: Get from auth session
        title,
        model: model || 'gpt-4o',
        systemPrompt,
      })
      .returning();
    
    convId = newConv.id;
  }

  // Save user messages to database
  for (const msg of userMessages) {
    if (msg.role === 'user') {
      await db.insert(messages).values({
        conversationId: convId!,
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Retrieve relevant memories if enabled
  let memoryContext = '';
  if (useMemory) {
    const lastUserMessage = userMessages.filter(m => m.role === 'user').pop();
    if (lastUserMessage) {
      const memories = await searchMemories('user-id', lastUserMessage.content, { limit: 5 });
      if (memories.length > 0) {
        memoryContext = '\n\nRelevant memories:\n' + 
          memories.map(m => `- ${m.content}`).join('\n');
      }
    }
  }

  // Get active MCP servers and tools if enabled
  let availableTools = [];
  if (useTools) {
    const mcpServers = await db.query.mcpServers.findMany({
      where: eq(mcpServers.status, 'active'),
    });
    
    if (mcpServers.length > 0) {
      availableTools = mcpToolsToAIServiceTools(mcpServers);
    }
  }

  // Build enhanced system prompt with memory context
  const enhancedSystemPrompt = systemPrompt 
    ? `${systemPrompt}${memoryContext}`
    : memoryContext
      ? `You are a helpful AI assistant.${memoryContext}`
      : undefined;

  // Create AI service
  const aiService = createAIService();

  // Set up streaming response
  const stream = await aiService.chat(userMessages, {
    systemPrompt: enhancedSystemPrompt,
    tools: availableTools.length > 0 ? availableTools : undefined,
    temperature: 0.7,
    maxTokens: 2048,
    callbacks: {
      onChunk: (chunk) => {
        // Stream chunk to client
      },
      onToolCall: async (toolCall) => {
        // Handle tool calls
        console.log('Tool called:', toolCall);
      },
      onComplete: async (result) => {
        // Save assistant response to database
        await db.insert(messages).values({
          conversationId: convId!,
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls as any,
          tokensUsed: (result.usage as any)?.totalTokens,
        });
      },
    },
  });

  // Return streaming response
  return sendStream(stream.toAIStream());
});
