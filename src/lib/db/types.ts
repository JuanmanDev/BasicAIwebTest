import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type DrizzleDatabase = PostgresJsDatabase<typeof schema>;
export type Schema = typeof schema;

// Re-export all schema types
export * from './schema';
