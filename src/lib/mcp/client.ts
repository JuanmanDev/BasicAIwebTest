/**
 * MCP (Model Context Protocol) Client & Server Management
 * Handles connection, tool execution, and UI rendering
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { McpServer, McpToolExecution } from '~/lib/schema';
import { getDb } from '~/lib/db';
import { mcpServers, mcpToolExecutions } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export interface McpConnectionConfig {
  url: string;
  transportType?: 'sse' | 'stdio' | 'websocket';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
    resource?: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    };
  }>;
  isError?: boolean;
}

export interface McpUIComponent {
  type: 'card' | 'form' | 'table' | 'chart' | 'button' | 'input' | 'select' | 'modal';
  props: Record<string, unknown>;
  children?: McpUIComponent[];
  actions?: Array<{
    label: string;
    action: string;
    params?: Record<string, unknown>;
  }>;
}

class McpClientManager {
  private clients: Map<string, Client> = new Map();
  private connections: Map<string, McpConnectionConfig> = new Map();

  async connect(serverId: string, config: McpConnectionConfig): Promise<Client> {
    if (this.clients.has(serverId)) {
      return this.clients.get(serverId)!;
    }

    const client = new Client({
      name: 'nuxt-ai-assistant',
      version: '1.0.0',
    });

    let transport;

    if (config.transportType === 'stdio' && config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: config.env,
      });
    } else {
      // Default to SSE
      transport = new SSEClientTransport(new URL(config.url));
    }

    await client.connect(transport);
    
    this.clients.set(serverId, client);
    this.connections.set(serverId, config);

    // Update server status in database
    const db = getDb();
    await db.update(mcpServers)
      .set({ status: 'active', lastSyncedAt: new Date() })
      .where(eq(mcpServers.id, serverId));

    return client;
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
      this.connections.delete(serverId);

      // Update server status in database
      const db = getDb();
      await db.update(mcpServers)
        .set({ status: 'inactive' })
        .where(eq(mcpServers.id, serverId));
    }
  }

  getClient(serverId: string): Client | undefined {
    return this.clients.get(serverId);
  }

  async listTools(serverId: string) {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await client.listTools();
    return response.tools;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpToolResult> {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const startTime = Date.now();
    let result: McpToolResult;
    let error: string | undefined;

    try {
      const response = await client.callTool({
        name: toolName,
        arguments: args,
      });

      result = response as McpToolResult;

      // Log successful execution
      const db = getDb();
      await db.insert(mcpToolExecutions).values({
        serverId,
        toolName,
        input: args,
        output: result as unknown as Record<string, unknown>,
        durationMs: Date.now() - startTime,
      });

      return result;
    } catch (err) {
      error = (err as Error).message;
      
      // Log failed execution
      const db = getDb();
      await db.insert(mcpToolExecutions).values({
        serverId,
        toolName,
        input: args,
        error,
        durationMs: Date.now() - startTime,
      });

      throw err;
    }
  }

  async listResources(serverId: string) {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await client.listResources();
    return response.resources;
  }

  async readResource(serverId: string, uri: string) {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await client.readResource({ uri });
    return response.contents;
  }

  async listPrompts(serverId: string) {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await client.listPrompts();
    return response.prompts;
  }

  async getPrompt(serverId: string, promptName: string, args?: Record<string, string>) {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const response = await client.getPrompt({
      name: promptName,
      arguments: args,
    });
    return response.messages;
  }

  /**
   * Auto-profile MCP server capabilities using LLM
   */
  async autoProfile(serverId: string): Promise<void> {
    const client = this.getClient(serverId);
    if (!client) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    const tools = await this.listTools(serverId);
    
    // Use AI to generate human-readable descriptions
    const { createAIService } = await import('~/lib/ai/service');
    const aiService = createAIService();

    const enhancedTools = await Promise.all(
      tools.map(async (tool) => {
        const description = await aiService.generate(
          `Generate a concise, human-readable description for this tool:\n\n` +
          `Name: ${tool.name}\n` +
          `Schema: ${JSON.stringify(tool.inputSchema)}\n\n` +
          `Description:`,
          { temperature: 0.3 }
        );

        return {
          ...tool,
          aiGeneratedDescription: description.trim(),
        };
      })
    );

    // Update server with profiled tools
    const db = getDb();
    await db.update(mcpServers)
      .set({
        tools: enhancedTools as unknown as McpServer['tools'],
        autoProfiled: true,
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, serverId));
  }

  /**
   * Check if tool result contains MCP UI component
   */
  extractUIComponent(result: McpToolResult): McpUIComponent | null {
    for (const content of result.content) {
      if (content.type === 'resource' && content.resource) {
        try {
          const data = JSON.parse(content.resource.text || '');
          if (data._mcp_ui_component || data.mcpUi) {
            return data as McpUIComponent;
          }
        } catch {
          // Not JSON, continue
        }
      }
    }
    return null;
  }
}

// Singleton instance
let globalMcpManager: McpClientManager | undefined;

export function getMcpManager(): McpClientManager {
  if (!globalMcpManager) {
    globalMcpManager = new McpClientManager();
  }
  return globalMcpManager;
}

/**
 * Call MCP tool helper
 */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const manager = getMcpManager();
  return manager.callTool(serverId, toolName, args);
}

/**
 * Connect to MCP server helper
 */
export async function connectMcpServer(
  serverId: string,
  config: McpConnectionConfig
): Promise<Client> {
  const manager = getMcpManager();
  return manager.connect(serverId, config);
}
