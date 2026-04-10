/**
 * Cron Jobs API
 * Manage scheduled jobs and autonomous agents
 */

import { getDb } from '~/lib/db';
import { cronJobs } from '~/lib/schema';
import { eq, desc } from 'drizzle-orm';
import { scheduleCronJob } from '~/lib/cron/bullmq';

export default defineEventHandler(async (event) => {
  const db = getDb();
  
  if (event.method === 'GET') {
    const userId = 'user-id';
    return db.query.cronJobs.findMany({
      where: eq(cronJobs.userId, userId),
      orderBy: [desc(cronJobs.createdAt)],
    });
  }
  
  if (event.method === 'POST') {
    const userId = 'user-id';
    
    const body = await readBody<{
      name: string;
      description?: string;
      type: 'chat' | 'agent' | 'custom';
      cronExpression?: string;
      config: Record<string, unknown>;
      enabled?: boolean;
    }>(event);
    
    const { name, description, type, cronExpression, config, enabled = true } = body;
    
    const [job] = await db.insert(cronJobs)
      .values({
        userId,
        name,
        description,
        type,
        cronExpression,
        config,
        status: 'pending',
        enabled,
      })
      .returning();
    
    if (cronExpression) {
      try {
        await scheduleCronJob(cronExpression, {
          jobId: job.id,
          userId,
          type,
          config,
        }, { name: job.name });
        
        await db.update(cronJobs)
          .set({ nextRunAt: new Date() })
          .where(eq(cronJobs.id, job.id));
      } catch (error) {
        await db.delete(cronJobs).where(eq(cronJobs.id, job.id));
        throw createError({ statusCode: 500, message: `Failed to schedule: ${(error as Error).message}` });
      }
    }
    
    return job;
  }
  
  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
