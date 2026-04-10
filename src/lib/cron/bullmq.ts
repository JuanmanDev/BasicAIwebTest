/**
 * BullMQ Integration for Background Jobs & Cron Scheduling
 * Handles autonomous AI agents, scheduled tasks, and job queues
 */

import { Queue, Worker, Job, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';
import type { CronJob, JobLog } from '~/lib/schema';
import { getDb } from '~/lib/db';
import { cronJobs, jobLogs } from '~/lib/schema';
import { eq } from 'drizzle-orm';

export interface JobData {
  jobId: string;
  userId: string;
  type: 'chat' | 'agent' | 'custom' | 'mcp' | 'memory';
  config: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface JobResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

let globalConnection: IORedis | undefined;

function getRedisConnection(): IORedis {
  if (!globalConnection) {
    globalConnection = new IORedis(connection);
  }
  return globalConnection;
}

// Queue instances
let taskQueue: Queue<JobData, JobResult> | undefined;
let cronQueue: Queue<JobData, JobResult> | undefined;
let agentQueue: Queue<JobData, JobResult> | undefined;

// Worker instances
let taskWorker: Worker<JobData, JobResult> | undefined;
let cronWorker: Worker<JobData, JobResult> | undefined;
let agentWorker: Worker<JobData, JobResult> | undefined;

/**
 * Initialize BullMQ queues and workers
 */
export async function initializeBullMQ() {
  const redisConnection = getRedisConnection();

  // Create queues
  taskQueue = new Queue<JobData, JobResult>('tasks', { connection: redisConnection });
  cronQueue = new Queue<JobData, JobResult>('cron-jobs', { connection: redisConnection });
  agentQueue = new Queue<JobData, JobResult>('agents', { connection: redisConnection });

  // Create workers
  taskWorker = new Worker<JobData, JobResult>(
    'tasks',
    async (job) => await processJob(job),
    { connection: redisConnection }
  );

  cronWorker = new Worker<JobData, JobResult>(
    'cron-jobs',
    async (job) => await processCronJob(job),
    { connection: redisConnection }
  );

  agentWorker = new Worker<JobData, JobResult>(
    'agents',
    async (job) => await processAgentJob(job),
    { connection: redisConnection }
  );

  // Set up event listeners
  setupWorkerListeners(taskWorker, 'task');
  setupWorkerListeners(cronWorker, 'cron');
  setupWorkerListeners(agentWorker, 'agent');

  console.log('BullMQ initialized successfully');
}

/**
 * Set up worker event listeners for logging and monitoring
 */
function setupWorkerListeners(
  worker: Worker<JobData, JobResult>,
  jobType: string
) {
  worker.on('completed', async (job, result) => {
    console.log(`[${jobType}] Job ${job.id} completed:`, result);
    await updateJobStatus(job.data.jobId, 'completed', result);
  });

  worker.on('failed', async (job, error) => {
    console.error(`[${jobType}] Job ${job?.id} failed:`, error);
    if (job) {
      await updateJobStatus(job.data.jobId, 'failed', { error: error.message });
    }
  });

  worker.on('active', async (job) => {
    console.log(`[${jobType}] Job ${job.id} started`);
    await updateJobStatus(job.data.jobId, 'active');
  });

  worker.on('stalled', async (jobId) => {
    console.warn(`[${jobType}] Job ${jobId} stalled`);
  });
}

/**
 * Process generic task job
 */
async function processJob(job: Job<JobData>): Promise<JobResult> {
  const startTime = Date.now();
  
  try {
    const { type, config } = job.data;

    switch (type) {
      case 'chat':
        return await processChatJob(config);
      case 'mcp':
        return await processMcpJob(config);
      case 'memory':
        return await processMemoryJob(config);
      default:
        throw new Error(`Unknown job type: ${type}`);
    }
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Process cron-scheduled job
 */
async function processCronJob(job: Job<JobData>): Promise<JobResult> {
  const startTime = Date.now();
  
  try {
    const { type, config, jobId } = job.data;

    // Execute the scheduled task
    let result: JobResult;

    switch (type) {
      case 'chat':
        result = await processChatJob(config);
        break;
      case 'agent':
        result = await processAgentJob(job);
        break;
      default:
        result = await processJob(job);
    }

    // Update cron job metadata
    const db = getDb();
    await db.update(cronJobs)
      .set({
        lastRunAt: new Date(),
        lastResult: result as unknown as Record<string, unknown>,
        lastError: result.error || null,
        runCount: (await db.query.cronJobs.findFirst({ where: eq(cronJobs.id, jobId) }))?.runCount! + 1,
      })
      .where(eq(cronJobs.id, jobId));

    return result;
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Process autonomous agent job
 */
async function processAgentJob(job: Job<JobData>): Promise<JobResult> {
  const startTime = Date.now();
  
  try {
    const { config } = job.data;

    // Autonomous agent execution with memory and tools
    const { createAIService } = await import('~/lib/ai/service');
    const { getMcpManager } = await import('~/lib/mcp/client');
    const { searchMemories } = await import('~/lib/memory/service');

    const aiService = createAIService();
    const mcpManager = getMcpManager();

    // Retrieve relevant memories
    const memories = await searchMemories(job.data.userId, config.query as string || '');

    // Build system prompt with memory context
    const systemPrompt = `
You are an autonomous AI agent. You have access to:
- Long-term memory context
- MCP tools for external integrations
- Ability to execute scheduled tasks

Current task: ${config.task || 'Execute autonomous behavior'}

Memory Context:
${memories.map(m => `- ${m.content}`).join('\n')}
`.trim();

    // Execute AI-driven task
    const result = await aiService.generate(config.prompt as string || '', {
      systemPrompt,
      temperature: config.temperature as number || 0.7,
    });

    return {
      success: true,
      output: { result },
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Process chat-related job
 */
async function processChatJob(config: Record<string, unknown>): Promise<JobResult> {
  const { createAIService } = await import('~/lib/ai/service');
  const aiService = createAIService();

  const result = await aiService.generate(
    config.prompt as string || '',
    {
      systemPrompt: config.systemPrompt as string,
      temperature: config.temperature as number || 0.7,
    }
  );

  return {
    success: true,
    output: { result },
  };
}

/**
 * Process MCP tool execution job
 */
async function processMcpJob(config: Record<string, unknown>): Promise<JobResult> {
  const { getMcpManager } = await import('~/lib/mcp/client');
  const mcpManager = getMcpManager();

  const result = await mcpManager.callTool(
    config.serverId as string,
    config.toolName as string,
    config.args as Record<string, unknown>
  );

  return {
    success: !result.isError,
    output: result,
  };
}

/**
 * Process memory-related job
 */
async function processMemoryJob(config: Record<string, unknown>): Promise<JobResult> {
  const { addMemory, searchMemories } = await import('~/lib/memory/service');

  if (config.action === 'add') {
    const memory = await addMemory({
      userId: config.userId as string,
      type: config.type as string || 'long_term',
      content: config.content as string,
      topics: config.topics as string[],
      tags: config.tags as string[],
    });

    return {
      success: true,
      output: { memory },
    };
  } else if (config.action === 'search') {
    const memories = await searchMemories(
      config.userId as string,
      config.query as string
    );

    return {
      success: true,
      output: { memories },
    };
  }

  throw new Error(`Unknown memory action: ${config.action}`);
}

/**
 * Update job status in database
 */
async function updateJobStatus(
  jobId: string,
  status: 'pending' | 'active' | 'completed' | 'failed' | 'cancelled',
  result?: JobResult
) {
  const db = getDb();
  const updates: Partial<CronJob> = { status };

  if (status === 'completed' || status === 'failed') {
    updates.lastRunAt = new Date();
  }

  if (result) {
    if (result.success) {
      updates.lastResult = { output: result.output } as Record<string, unknown>;
    } else {
      updates.lastError = result.error;
    }
  }

  await db.update(cronJobs)
    .set(updates)
    .where(eq(cronJobs.id, jobId));

  // Log the job execution
  await db.insert(jobLogs).values({
    jobId,
    status,
    startedAt: status === 'active' ? new Date() : undefined,
    completedAt: (status === 'completed' || status === 'failed') ? new Date() : undefined,
    output: result?.output ? JSON.stringify(result.output) : undefined,
    error: result?.error,
  });
}

/**
 * Add job to queue
 */
export async function addJob(
  queueName: 'tasks' | 'cron-jobs' | 'agents',
  data: JobData,
  options?: {
    delay?: number;
    priority?: number;
    jobId?: string;
  }
): Promise<Job<JobData, JobResult>> {
  let queue: Queue<JobData, JobResult> | undefined;

  switch (queueName) {
    case 'tasks':
      queue = taskQueue;
      break;
    case 'cron-jobs':
      queue = cronQueue;
      break;
    case 'agents':
      queue = agentQueue;
      break;
  }

  if (!queue) {
    throw new Error('BullMQ not initialized');
  }

  return queue.add(data, options);
}

/**
 * Schedule a cron job
 */
export async function scheduleCronJob(
  cronExpression: string,
  data: JobData,
  options?: {
    jobId?: string;
    name?: string;
  }
): Promise<void> {
  if (!cronQueue) {
    throw new Error('BullMQ not initialized');
  }

  // Use repeat option for cron scheduling
  await cronQueue.add(
    data,
    {
      repeat: {
        pattern: cronExpression,
      },
      jobId: options?.jobId || data.jobId,
    }
  );
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: 'tasks' | 'cron-jobs' | 'agents') {
  let queue: Queue<JobData, JobResult> | undefined;

  switch (queueName) {
    case 'tasks':
      queue = taskQueue;
      break;
    case 'cron-jobs':
      queue = cronQueue;
      break;
    case 'agents':
      queue = agentQueue;
      break;
  }

  if (!queue) {
    throw new Error('BullMQ not initialized');
  }

  const [waiting, active, completed, failed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}

/**
 * Clean up old jobs
 */
export async function cleanupOldJobs(daysToKeep: number = 7) {
  const queues = [taskQueue, cronQueue, agentQueue];
  const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  for (const queue of queues) {
    if (!queue) continue;

    try {
      await queue.clean(cutoffTime, 1000, 'completed');
      await queue.clean(cutoffTime, 1000, 'failed');
    } catch (error) {
      console.error('Error cleaning jobs:', error);
    }
  }
}
