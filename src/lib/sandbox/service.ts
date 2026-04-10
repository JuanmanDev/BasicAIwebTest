/**
 * Secure Code Sandbox Service
 * Browser-first execution using WebContainers (Node.js) and Pyodide (Python)
 * With optional server-side Docker isolation
 */

import type { SandboxSession } from '~/lib/schema';

export interface SandboxConfig {
  type: 'webcontainer' | 'pyodide' | 'docker';
  timeout?: number;
  memoryLimit?: number;
  networkAccess?: boolean;
}

export interface FileContent {
  content: string;
  language: string;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  files?: Record<string, FileContent>;
  durationMs?: number;
}

export class SandboxService {
  private config: SandboxConfig;
  private instance: any = null;
  private isInitialized = false;

  constructor(config: SandboxConfig) {
    this.config = config;
  }

  /**
   * Initialize the sandbox environment
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const startTime = Date.now();

    try {
      switch (this.config.type) {
        case 'webcontainer':
          await this.initWebContainer();
          break;
        case 'pyodide':
          await this.initPyodide();
          break;
        case 'docker':
          // Server-side only - handled by API
          throw new Error('Docker sandbox requires server-side execution');
      }

      this.isInitialized = true;
      console.log(`Sandbox initialized in ${Date.now() - startTime}ms`);
    } catch (error) {
      console.error('Sandbox initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize WebContainer for Node.js execution
   */
  private async initWebContainer(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('WebContainer requires browser environment');
    }

    const { WebContainer } = await import('@webcontainer/api');
    
    // Boot the container
    this.instance = await WebContainer.boot();
    
    // Mount initial file system
    await this.instance.mount({
      '.': {
        directory: {
          'package.json': {
            file: {
              contents: JSON.stringify({
                name: 'sandbox',
                version: '1.0.0',
                type: 'module',
              }),
            },
          },
        },
      },
    });

    // Install dependencies if needed
    const installProcess = await this.instance.spawn('npm', ['install']);
    installProcess.output.pipeTo(new WritableStream({
      write(data) {
        console.log('[npm]', data);
      },
    }));

    await installProcess.exit;
  }

  /**
   * Initialize Pyodide for Python execution
   */
  private async initPyodide(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Pyodide requires browser environment');
    }

    // @ts-ignore - Pyodide types
    const { loadPyodide } = await import('@pyodide/pyodide');
    
    this.instance = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
    });

    // Load common packages
    await this.instance.loadPackage(['micropip', 'numpy', 'pandas']);
  }

  /**
   * Execute code in the sandbox
   */
  async execute(code: string, options?: {
    files?: Record<string, FileContent>;
    input?: string;
    args?: string[];
  }): Promise<ExecutionResult> {
    await this.initialize();

    const startTime = Date.now();
    const timeout = this.config.timeout || 30000;

    try {
      // Write files to sandbox
      if (options?.files) {
        await this.writeFiles(options.files);
      }

      let result: ExecutionResult;

      switch (this.config.type) {
        case 'webcontainer':
          result = await this.executeNode(code, options);
          break;
        case 'pyodide':
          result = await this.executePython(code, options);
          break;
        default:
          throw new Error(`Unsupported sandbox type: ${this.config.type}`);
      }

      result.durationMs = Date.now() - startTime;
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
   * Execute Node.js code in WebContainer
   */
  private async executeNode(
    code: string,
    options?: { input?: string; args?: string[] }
  ): Promise<ExecutionResult> {
    if (!this.instance) {
      throw new Error('WebContainer not initialized');
    }

    // Write main script
    await this.instance.fs.writeFile('index.js', code);

    // Spawn Node.js process
    const process = await this.instance.spawn('node', [
      'index.js',
      ...(options?.args || []),
    ]);

    let output = '';
    let errorOutput = '';

    // Capture stdout and stderr
    const outputPromise = process.output.pipeTo(
      new WritableStream({
        write(chunk) {
          output += chunk;
        },
      })
    );

    // Set up input if provided
    if (options?.input) {
      const writer = process.input.getWriter();
      await writer.write(options.input);
      await writer.close();
    }

    // Wait for process with timeout
    const exitCode = await Promise.race([
      process.exit,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), this.config.timeout || 30000)
      ),
    ]);

    await outputPromise;

    return {
      success: exitCode === 0,
      output: output.trim(),
      error: exitCode !== 0 ? errorOutput || 'Process failed' : undefined,
    };
  }

  /**
   * Execute Python code in Pyodide
   */
  private async executePython(
    code: string,
    options?: { input?: string }
  ): Promise<ExecutionResult> {
    if (!this.instance) {
      throw new Error('Pyodide not initialized');
    }

    try {
      // Set up stdin if input provided
      if (options?.input) {
        this.instance.setStdin({
          batched: () => options.input!,
        });
      }

      // Capture stdout
      let output = '';
      this.instance.setStdout({
        batched: (text: string) => {
          output += text;
        },
      });

      // Execute code
      await this.instance.runPythonAsync(code);

      return {
        success: true,
        output: output.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Write files to sandbox filesystem
   */
  private async writeFiles(files: Record<string, FileContent>): Promise<void> {
    if (!this.instance) return;

    for (const [path, file] of Object.entries(files)) {
      const dir = path.substring(0, path.lastIndexOf('/'));
      
      if (dir) {
        await this.instance.fs.mkdir(dir, { recursive: true });
      }
      
      await this.instance.fs.writeFile(path, file.content);
    }
  }

  /**
   * Read files from sandbox
   */
  async readFiles(paths: string[]): Promise<Record<string, FileContent>> {
    if (!this.instance) {
      throw new Error('Sandbox not initialized');
    }

    const files: Record<string, FileContent> = {};

    for (const path of paths) {
      try {
        const content = await this.instance.fs.readFile(path, { encoding: 'utf-8' });
        const ext = path.split('.').pop() || 'txt';
        files[path] = {
          content,
          language: this.getLanguageFromExt(ext),
        };
      } catch (error) {
        console.warn(`Failed to read ${path}:`, error);
      }
    }

    return files;
  }

  /**
   * List files in sandbox
   */
  async listFiles(dir: string = '.'): Promise<string[]> {
    if (!this.instance) {
      throw new Error('Sandbox not initialized');
    }

    const entries = await this.instance.fs.readdir(dir);
    return entries as string[];
  }

  /**
   * Reset sandbox to clean state
   */
  async reset(): Promise<void> {
    if (this.config.type === 'docker') {
      // For Docker, we'd destroy and recreate the container
      return;
    }

    // For WebContainer and Pyodide, reinitialize
    this.instance = null;
    this.isInitialized = false;
    await this.initialize();
  }

  /**
   * Destroy sandbox and cleanup resources
   */
  async destroy(): Promise<void> {
    if (this.instance && this.config.type === 'webcontainer') {
      // WebContainer doesn't have a destroy method yet
      // but we can nullify the reference
      this.instance = null;
    }
    
    this.isInitialized = false;
  }

  /**
   * Get language from file extension
   */
  private getLanguageFromExt(ext: string): string {
    const map: Record<string, string> = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      json: 'json',
      md: 'markdown',
      html: 'html',
      css: 'css',
      txt: 'text',
    };
    return map[ext] || 'text';
  }
}

/**
 * Create sandbox session helper
 */
export async function createSandboxSession(
  userId: string,
  type: 'webcontainer' | 'pyodide' | 'docker'
): Promise<SandboxSession> {
  const { getDb } = await import('~/lib/db');
  const { sandboxSessions } = await import('~/lib/schema');
  
  const db = getDb();
  
  const [session] = await db.insert(sandboxSessions)
    .values({
      userId,
      type,
      status: 'idle',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
    })
    .returning();
  
  return session;
}

/**
 * Execute code via API (for server-side or Docker sandboxes)
 */
export async function executeCodeInSandbox(
  sessionId: string,
  code: string,
  options?: {
    files?: Record<string, FileContent>;
    input?: string;
  }
): Promise<ExecutionResult> {
  // For client-side sandboxes, use the SandboxService directly
  // For server-side, call the API endpoint
  
  const response = await fetch(`/api/sandbox/${sessionId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, ...options }),
  });
  
  if (!response.ok) {
    throw new Error(await response.text());
  }
  
  return response.json();
}
