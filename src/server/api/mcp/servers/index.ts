/**
 * MCP Servers API
 * Manage MCP server connections, tools, and auto-profiling
 */

import { getDb } from '~/lib/db';
import { mcpServers } from '~/lib/schema';
import { eq } from 'drizzle-orm';
import { getMcpManager } from '~/lib/mcp/client';

export default defineEventHandler(async (event) => {
  const db = getDb();
  
  if (event.method === 'GET') {
    // List all MCP servers
    return db.query.mcpServers.findMany({
      orderBy: (servers, { desc }) => [desc(servers.createdAt)],
    });
  }
  
  if (event.method === 'POST') {
    // Create/connect new MCP server
    const body = await readBody<{
      name: string;
      description?: string;
      url: string;
      transportType?: 'sse' | 'stdio' | 'websocket';
      command?: string;
      args?: string[];
      config?: Record<string, unknown>;
      autoProfile?: boolean;
    }>(event);
    
    const { name, description, url, transportType = 'sse', command, args, config, autoProfile = false } = body;
    
    // Check if server already exists
    const existing = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.name, name),
    });
    
    if (existing) {
      throw createError({ statusCode: 409, message: 'Server with this name already exists' });
    }
    
    // Create server record
    const [server] = await db.insert(mcpServers)
      .values({
        name,
        description,
        url,
        transportType,
        config,
        status: 'inactive',
      })
      .returning();
    
    // Connect to server
    try {
      const manager = getMcpManager();
      await manager.connect(server.id, {
        url,
        transportType,
        command,
        args,
      });
      
      // Fetch tools and resources
      const tools = await manager.listTools(server.id);
      const resources = await manager.listResources(server.id);
      const prompts = await manager.listPrompts(server.id);
      
      // Update server with fetched data
      await db.update(mcpServers)
        .set({
          tools: tools as any,
          resources: resources as any,
          prompts: prompts as any,
          status: 'active',
          lastSyncedAt: new Date(),
        })
        .where(eq(mcpServers.id, server.id));
      
      // Auto-profile if requested
      if (autoProfile) {
        setTimeout(async () => {
          try {
            await manager.autoProfile(server.id);
          } catch (error) {
            console.error('Auto-profile failed:', error);
          }
        }, 1000);
      }
      
      return {
        ...server,
        tools,
        resources,
        prompts,
      };
    } catch (error) {
      await db.delete(mcpServers).where(eq(mcpServers.id, server.id));
      throw createError({ 
        statusCode: 500, 
        message: `Failed to connect to MCP server: ${(error as Error).message}` 
      });
    }
  }
  
  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
