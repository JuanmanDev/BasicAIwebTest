/**
 * Database Schema for AI Assistant Hub
 * Using Drizzle ORM with PostgreSQL
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const roleEnum = pgEnum('role', ['user', 'admin', 'system']);
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'system', 'tool']);
export const jobStatusEnum = pgEnum('job_status', ['pending', 'active', 'completed', 'failed', 'cancelled']);
export const memoryTypeEnum = pgEnum('memory_type', ['short_term', 'long_term', 'semantic', 'episodic']);
export const mcpServerStatusEnum = pgEnum('mcp_server_status', ['active', 'inactive', 'error']);

// ============================================
// Users & Authentication
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  image: text('image'),
  role: roleEnum('role').default('user').notNull(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('users_email_idx').on(table.email)]);

export const accounts = pgTable('accounts', {
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 255 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: varchar('token_type', { length: 255 }),
  scope: varchar('scope', { length: 255 }),
  id_token: text('id_token'),
  session_state: varchar('session_state', { length: 255 }),
}, (table) => [
  index('accounts_user_id_idx').on(table.userId),
  index('accounts_provider_account_id_idx').on(table.providerAccountId),
]);

export const sessions = pgTable('sessions', {
  sessionToken: varchar('session_token', { length: 255 }).primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => [index('sessions_user_id_idx').on(table.userId)]);

export const verificationTokens = pgTable('verification_tokens', {
  identifier: varchar('identifier', { length: 255 }).notNull(),
  token: varchar('token', { length: 255 }).notNull(),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
}, (table) => [index('verification_tokens_token_idx').on(table.token)]);

// ============================================
// Chat & Messages
// ============================================

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  model: varchar('model', { length: 255 }).notNull(),
  systemPrompt: text('system_prompt'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('conversations_user_id_idx').on(table.userId)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: messageRoleEnum('role').notNull(),
  content: text('content').notNull(),
  reasoningContent: text('reasoning_content'), // For think/reasoning models
  toolCalls: jsonb('tool_calls').$type<Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>>(),
  toolCallId: varchar('tool_call_id', { length: 255 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  tokensUsed: integer('tokens_used'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('messages_conversation_id_idx').on(table.conversationId),
  index('messages_created_at_idx').on(table.createdAt),
]);

// ============================================
// MCP Servers & Tools
// ============================================

export const mcpServers = pgTable('mcp_servers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull().unique(),
  description: text('description'),
  url: text('url').notNull(),
  transportType: varchar('transport_type', { length: 50 }).default('sse').notNull(), // sse, stdio, websocket
  status: mcpServerStatusEnum('status').default('inactive').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>(),
  tools: jsonb('tools').$type<Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    aiGeneratedDescription?: string;
  }>>(),
  resources: jsonb('resources').$type<Array<Record<string, unknown>>>(),
  prompts: jsonb('prompts').$type<Array<Record<string, unknown>>>(),
  autoProfiled: boolean('auto_profiled').default(false),
  lastSyncedAt: timestamp('last_synced', { mode: 'date' }),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [index('mcp_servers_status_idx').on(table.status)]);

export const mcpToolExecutions = pgTable('mcp_tool_executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  serverId: uuid('server_id')
    .notNull()
    .references(() => mcpServers.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 255 }).notNull(),
  input: jsonb('input').$type<Record<string, unknown>>(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  error: text('error'),
  durationMs: integer('duration_ms'),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('mcp_tool_executions_server_id_idx').on(table.serverId),
  index('mcp_tool_executions_created_at_idx').on(table.createdAt),
]);

// ============================================
// Memory System (pgvector compatible)
// ============================================

export const memories = pgTable('memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: memoryTypeEnum('type').notNull(),
  content: text('content').notNull(),
  embedding: text('embedding'), // Will store as vector string, use pgvector extension
  topics: varchar('topics', { length: 255 }).array(),
  tags: varchar('tags', { length: 255 }).array(),
  groups: varchar('groups', { length: 255 }).array(),
  importance: integer('importance').default(1),
  accessCount: integer('access_count').default(0),
  lastAccessedAt: timestamp('last_accessed', { mode: 'date' }),
  expiresAt: timestamp('expires', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('memories_user_id_idx').on(table.userId),
  index('memories_type_idx').on(table.type),
  index('memories_topics_idx').on(table.topics),
  index('memories_tags_idx').on(table.tags),
]);

export const systemRules = pgTable('system_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  rule: text('rule').notNull(),
  category: varchar('category', { length: 255 }),
  enabled: boolean('enabled').default(true).notNull(),
  priority: integer('priority').default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
});

// ============================================
// Cron Jobs & Background Tasks (BullMQ)
// ============================================

export const cronJobs = pgTable('cron_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  type: varchar('type', { length: 50 }).notNull(), // chat, agent, custom
  cronExpression: varchar('cron_expression', { length: 255 }),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  status: jobStatusEnum('status').default('pending').notNull(),
  lastRunAt: timestamp('last_run', { mode: 'date' }),
  nextRunAt: timestamp('next_run', { mode: 'date' }),
  lastResult: jsonb('last_result').$type<Record<string, unknown>>(),
  lastError: text('last_error'),
  runCount: integer('run_count').default(0),
  maxRuns: integer('max_runs'),
  enabled: boolean('enabled').default(true).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('cron_jobs_user_id_idx').on(table.userId),
  index('cron_jobs_status_idx').on(table.status),
  index('cron_jobs_next_run_idx').on(table.nextRunAt),
]);

export const jobLogs = pgTable('job_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => cronJobs.id, { onDelete: 'cascade' }),
  status: jobStatusEnum('status').notNull(),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
  output: text('output'),
  error: text('error'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('job_logs_job_id_idx').on(table.jobId),
  index('job_logs_created_at_idx').on(table.createdAt),
]);

// ============================================
// Sandbox Sessions
// ============================================

export const sandboxSessions = pgTable('sandbox_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // webcontainer, pyodide, docker
  status: varchar('status', { length: 50 }).default('idle').notNull(),
  files: jsonb('files').$type<Record<string, { content: string; language: string }>>(),
  environment: jsonb('environment').$type<Record<string, string>>(),
  logs: text('logs').array(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  containerId: varchar('container_id', { length: 255 }), // For Docker-based sandboxes
  port: integer('port'),
  expiresAt: timestamp('expires', { mode: 'date' }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow().notNull(),
}, (table) => [
  index('sandbox_sessions_user_id_idx').on(table.userId),
  index('sandbox_sessions_status_idx').on(table.status),
]);

// ============================================
// Relations
// ============================================

export const usersRelations = relations(users, ({ many }) => ({
  conversations: many(conversations),
  memories: many(memories),
  cronJobs: many(cronJobs),
  sandboxSessions: many(sandboxSessions),
  accounts: many(accounts),
  sessions: many(sessions),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const mcpServersRelations = relations(mcpServers, ({ many }) => ({
  toolExecutions: many(mcpToolExecutions),
}));

export const mcpToolExecutionsRelations = relations(mcpToolExecutions, ({ one }) => ({
  server: one(mcpServers, {
    fields: [mcpToolExecutions.serverId],
    references: [mcpServers.id],
  }),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  user: one(users, {
    fields: [memories.userId],
    references: [users.id],
  }),
}));

export const cronJobsRelations = relations(cronJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [cronJobs.userId],
    references: [users.id],
  }),
  logs: many(jobLogs),
}));

export const jobLogsRelations = relations(jobLogs, ({ one }) => ({
  job: one(cronJobs, {
    fields: [jobLogs.jobId],
    references: [cronJobs.id],
  }),
}));

export const sandboxSessionsRelations = relations(sandboxSessions, ({ one }) => ({
  user: one(users, {
    fields: [sandboxSessions.userId],
    references: [users.id],
  }),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type McpServer = typeof mcpServers.$inferSelect;
export type NewMcpServer = typeof mcpServers.$inferInsert;
export type McpToolExecution = typeof mcpToolExecutions.$inferSelect;
export type NewMcpToolExecution = typeof mcpToolExecutions.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;
export type SystemRule = typeof systemRules.$inferSelect;
export type NewSystemRule = typeof systemRules.$inferInsert;
export type CronJob = typeof cronJobs.$inferSelect;
export type NewCronJob = typeof cronJobs.$inferInsert;
export type JobLog = typeof jobLogs.$inferSelect;
export type NewJobLog = typeof jobLogs.$inferInsert;
export type SandboxSession = typeof sandboxSessions.$inferSelect;
export type NewSandboxSession = typeof sandboxSessions.$inferInsert;
