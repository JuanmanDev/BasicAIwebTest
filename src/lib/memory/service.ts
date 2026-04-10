/**
 * Memory Service with pgvector integration
 * Handles long-term memory storage and semantic search
 */

import { getDb } from '~/lib/db';
import { memories, type Memory, type NewMemory } from '~/lib/schema';
import { eq, and, sql, desc, asc, or, arrayContains } from 'drizzle-orm';

export interface MemoryFilters {
  topics?: string[];
  tags?: string[];
  groups?: string[];
  type?: 'short_term' | 'long_term' | 'semantic' | 'episodic';
  userId: string;
}

export interface SearchOptions {
  limit?: number;
  minImportance?: number;
  includeExpired?: boolean;
}

/**
 * Generate embedding for memory content
 * In production, use a proper embedding model via LiteLLM or dedicated service
 */
async function generateEmbedding(text: string): Promise<string> {
  // Placeholder - integrate with actual embedding service
  // Options: OpenAI embeddings, Cohere, HuggingFace, etc.
  
  const { createAIService } = await import('~/lib/ai/service');
  const aiService = createAIService();
  
  // For now, return a placeholder
  // In production, call embedding API and store as vector string
  const hash = simpleHash(text);
  return Array(1536).fill(0).map((_, i) => Math.sin(hash + i) * 0.1).join(',');
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

/**
 * Add memory to database
 */
export async function addMemory(data: Omit<NewMemory, 'id' | 'createdAt' | 'updatedAt'>): Promise<Memory> {
  const db = getDb();
  
  // Generate embedding if not provided
  let embedding = data.embedding;
  if (!embedding && data.content) {
    embedding = await generateEmbedding(data.content);
  }
  
  const [memory] = await db.insert(memories)
    .values({
      ...data,
      embedding,
      importance: data.importance || 1,
      accessCount: 0,
    })
    .returning();
  
  return memory;
}

/**
 * Search memories by semantic similarity (pgvector)
 */
export async function searchMemories(
  userId: string,
  query: string,
  options: SearchOptions = {}
): Promise<Memory[]> {
  const db = getDb();
  const { limit = 10, minImportance = 0, includeExpired = false } = options;
  
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query);
  
  // Build query with vector similarity
  const conditions = [eq(memories.userId, userId)];
  
  if (!includeExpired) {
    conditions.push(
      or(
        eq(memories.expiresAt, null),
        sql`${memories.expiresAt} > NOW()`
      )
    );
  }
  
  if (minImportance > 0) {
    conditions.push(sql`${memories.importance} >= ${minImportance}`);
  }
  
  // Use pgvector cosine similarity
  // Note: This requires pgvector extension installed
  const results = await db.execute(sql`
    SELECT *,
      1 - (embedding <=> ${queryEmbedding}::vector) AS similarity
    FROM ${memories}
    WHERE ${sql.join(conditions, sql` AND `)}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `);
  
  // Update access count for retrieved memories
  for (const memory of results) {
    await db.update(memories)
      .set({
        accessCount: sql`${memories.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(memories.id, memory.id));
  }
  
  return results as unknown as Memory[];
}

/**
 * Search memories by filters (non-semantic)
 */
export async function findMemories(filters: MemoryFilters): Promise<Memory[]> {
  const db = getDb();
  
  const conditions = [eq(memories.userId, filters.userId)];
  
  if (filters.topics && filters.topics.length > 0) {
    conditions.push(arrayContains(memories.topics, filters.topics));
  }
  
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(arrayContains(memories.tags, filters.tags));
  }
  
  if (filters.groups && filters.groups.length > 0) {
    conditions.push(arrayContains(memories.groups, filters.groups));
  }
  
  if (filters.type) {
    conditions.push(eq(memories.type, filters.type));
  }
  
  // Exclude expired unless specified
  conditions.push(
    or(
      eq(memories.expiresAt, null),
      sql`${memories.expiresAt} > NOW()`
    )
  );
  
  const results = await db.query.memories.findMany({
    where: and(...conditions),
    orderBy: [desc(memories.createdAt)],
  });
  
  return results;
}

/**
 * Get memory by ID
 */
export async function getMemory(id: string, userId: string): Promise<Memory | undefined> {
  const db = getDb();
  
  const memory = await db.query.memories.findFirst({
    where: and(eq(memories.id, id), eq(memories.userId, userId)),
  });
  
  if (memory) {
    // Update access stats
    await db.update(memories)
      .set({
        accessCount: sql`${memories.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(eq(memories.id, id));
  }
  
  return memory;
}

/**
 * Update memory
 */
export async function updateMemory(
  id: string,
  userId: string,
  data: Partial<Memory>
): Promise<Memory> {
  const db = getDb();
  
  const [updated] = await db.update(memories)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(memories.id, id), eq(memories.userId, userId)))
    .returning();
  
  return updated;
}

/**
 * Delete memory
 */
export async function deleteMemory(id: string, userId: string): Promise<void> {
  const db = getDb();
  
  await db.delete(memories)
    .where(and(eq(memories.id, id), eq(memories.userId, userId)));
}

/**
 * Get memory statistics for user
 */
export async function getMemoryStats(userId: string) {
  const db = getDb();
  
  const memoriesList = await db.query.memories.findMany({
    where: eq(memories.userId, userId),
  });
  
  const total = memoriesList.length;
  const byType = memoriesList.reduce((acc, m) => {
    acc[m.type] = (acc[m.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const avgImportance = memoriesList.reduce((sum, m) => sum + (m.importance || 0), 0) / total || 0;
  const totalAccesses = memoriesList.reduce((sum, m) => sum + (m.accessCount || 0), 0);
  
  return {
    total,
    byType,
    avgImportance,
    totalAccesses,
  };
}

/**
 * Expire old memories based on TTL
 */
export async function expireOldMemories(): Promise<number> {
  const db = getDb();
  
  const result = await db.delete(memories)
    .where(sql`${memories.expiresAt} < NOW()`);
  
  return result.rowCount || 0;
}

/**
 * Consolidate similar memories using AI
 * Helps reduce memory duplication and improve retrieval
 */
export async function consolidateMemories(userId: string): Promise<void> {
  const db = getDb();
  const { createAIService } = await import('~/lib/ai/service');
  const aiService = createAIService();
  
  // Get memories with high similarity
  const memoriesList = await db.query.memories.findMany({
    where: eq(memories.userId, userId),
    limit: 50,
  });
  
  // Group by topics
  const grouped = memoriesList.reduce((acc, m) => {
    const key = m.topics?.join(',') || 'untagged';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, Memory[]>);
  
  // For each group with multiple memories, ask AI to consolidate
  for (const [topic, group] of Object.entries(grouped)) {
    if (group.length < 2) continue;
    
    const prompt = `Consolidate these memories into a single, comprehensive memory:\n\n` +
      group.map((m, i) => `${i + 1}. ${m.content}`).join('\n') +
      `\n\nProvide a single consolidated memory:`;
    
    const consolidated = await aiService.generate(prompt, { temperature: 0.3 });
    
    // Create consolidated memory
    await addMemory({
      userId,
      type: 'long_term',
      content: consolidated,
      topics: group[0].topics,
      tags: [...new Set(group.flatMap(m => m.tags || []))],
      importance: Math.max(...group.map(m => m.importance || 1)),
    });
    
    // Mark old memories for deletion (or reduce importance)
    for (const m of group) {
      await updateMemory(m.id, userId, { importance: Math.max(0, (m.importance || 1) - 1) });
    }
  }
}
