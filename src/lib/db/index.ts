import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import type { DrizzleDatabase } from './types';

let globalDb: DrizzleDatabase | undefined;

export function getDb() {
  if (globalDb) {
    return globalDb;
  }

  const config = useRuntimeConfig();
  const client = postgres(config.databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
  });

  globalDb = drizzle(client, { schema });
  return globalDb;
}

export async function executeQuery<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}
