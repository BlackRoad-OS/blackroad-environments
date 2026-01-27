/**
 * BlackRoad Environments - Agent Configuration
 *
 * Configuration and presets for AI agents used in automation.
 */

import { z } from 'zod';
import type { AgentConfig, AgentTask, AgentTool, RetryPolicy } from '../types/index.js';
import { hashId } from '../utils/hash.js';

// ============================================
// Agent Presets
// ============================================

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
};

export const AGENT_PRESETS: Record<string, Partial<AgentConfig>> = {
  // Code Review Agent
  codeReview: {
    name: 'Code Review Agent',
    model: 'claude-opus-4-5-20251101',
    maxTokens: 8192,
    temperature: 0.3,
    systemPrompt: `You are a senior code reviewer. Analyze code changes for:
- Security vulnerabilities
- Performance issues
- Code style and best practices
- Potential bugs
- Test coverage gaps

Provide specific, actionable feedback with line numbers where applicable.
Rate the overall quality from 1-10 and list blockers that must be fixed before merge.`,
  },

  // PR Validation Agent
  prValidation: {
    name: 'PR Validation Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.1,
    systemPrompt: `You are a PR validation assistant. Your job is to:
1. Verify all CI checks pass
2. Ensure proper test coverage
3. Check for merge conflicts
4. Validate commit messages follow conventions
5. Verify documentation is updated

Output a structured validation report with pass/fail status for each check.`,
  },

  // State Sync Agent
  stateSync: {
    name: 'State Sync Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0,
    systemPrompt: `You are a state synchronization agent. Your responsibilities:
1. Detect state drift between Cloudflare, Salesforce, and GitHub
2. Resolve conflicts using the configured resolution strategy
3. Ensure data integrity with hash verification
4. Report sync status and any anomalies

Always verify hashes before and after sync operations.`,
  },

  // Deployment Agent
  deployment: {
    name: 'Deployment Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.2,
    systemPrompt: `You are a deployment orchestration agent. Your tasks:
1. Coordinate deployments across Vercel, Digital Ocean, and Cloudflare
2. Verify pre-deployment checks pass
3. Monitor deployment progress
4. Handle rollback if deployment fails
5. Update state records after successful deployment

Always follow the deployment checklist and document each step.`,
  },

  // Documentation Agent
  documentation: {
    name: 'Documentation Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 8192,
    temperature: 0.5,
    systemPrompt: `You are a technical documentation agent. Your responsibilities:
1. Generate documentation from code comments and types
2. Keep README files up to date
3. Create API documentation
4. Update CHANGELOG entries
5. Generate migration guides for breaking changes

Write clear, concise documentation that follows the project's style guide.`,
  },

  // Issue Triage Agent
  issueTriage: {
    name: 'Issue Triage Agent',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
    temperature: 0.3,
    systemPrompt: `You are an issue triage agent. Your tasks:
1. Categorize issues by type (bug, feature, question, etc.)
2. Assign priority labels
3. Add relevant labels
4. Suggest assignees based on code ownership
5. Link related issues and PRs
6. Update GitHub Projects board

Respond with structured triage recommendations.`,
  },
};

// ============================================
// Agent Factory
// ============================================

/**
 * Create an agent configuration
 */
export function createAgentConfig(
  preset: keyof typeof AGENT_PRESETS | string,
  overrides?: Partial<AgentConfig>
): AgentConfig {
  const basePreset = AGENT_PRESETS[preset] ?? {};

  return {
    id: hashId('agent'),
    name: overrides?.name ?? basePreset.name ?? 'Custom Agent',
    model: overrides?.model ?? basePreset.model ?? 'claude-sonnet-4-20250514',
    maxTokens: overrides?.maxTokens ?? basePreset.maxTokens ?? 4096,
    temperature: overrides?.temperature ?? basePreset.temperature ?? 0.3,
    systemPrompt: overrides?.systemPrompt ?? basePreset.systemPrompt ?? '',
    tools: overrides?.tools ?? [],
    retryPolicy: overrides?.retryPolicy ?? DEFAULT_RETRY_POLICY,
  };
}

// ============================================
// Task Queue
// ============================================

export class TaskQueue {
  private tasks: Map<string, AgentTask> = new Map();
  private listeners: Set<(task: AgentTask) => void> = new Set();

  /**
   * Add a task to the queue
   */
  add(task: AgentTask): void {
    this.tasks.set(task.id, task);
    this.notifyListeners(task);
  }

  /**
   * Get a task by ID
   */
  get(id: string): AgentTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: AgentTask['status']): AgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.status === status);
  }

  /**
   * Get tasks by priority
   */
  getByPriority(priority: AgentTask['priority']): AgentTask[] {
    return Array.from(this.tasks.values()).filter(t => t.priority === priority);
  }

  /**
   * Get next task to execute (highest priority, oldest first)
   */
  getNext(): AgentTask | undefined {
    const pending = this.getByStatus('pending');

    if (pending.length === 0) return undefined;

    // Sort by priority (critical > high > medium > low) then by creation time
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    pending.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return pending[0];
  }

  /**
   * Update a task
   */
  update(id: string, updates: Partial<AgentTask>): AgentTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: AgentTask = {
      ...task,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    this.tasks.set(id, updated);
    this.notifyListeners(updated);

    return updated;
  }

  /**
   * Remove a task
   */
  remove(id: string): boolean {
    return this.tasks.delete(id);
  }

  /**
   * Get all tasks
   */
  all(): AgentTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get queue statistics
   */
  stats(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    blocked: number;
  } {
    const all = this.all();

    return {
      total: all.length,
      pending: all.filter(t => t.status === 'pending').length,
      inProgress: all.filter(t => t.status === 'in_progress').length,
      completed: all.filter(t => t.status === 'completed').length,
      failed: all.filter(t => t.status === 'failed').length,
      blocked: all.filter(t => t.status === 'blocked').length,
    };
  }

  /**
   * Subscribe to task updates
   */
  subscribe(listener: (task: AgentTask) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(task: AgentTask): void {
    for (const listener of this.listeners) {
      listener(task);
    }
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.tasks.clear();
  }

  /**
   * Export tasks to JSON
   */
  export(): AgentTask[] {
    return this.all();
  }

  /**
   * Import tasks from JSON
   */
  import(tasks: AgentTask[]): void {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }
}

// ============================================
// Tool Definitions
// ============================================

export const COMMON_TOOLS: Record<string, Omit<AgentTool, 'handler'>> = {
  readFile: {
    name: 'read_file',
    description: 'Read the contents of a file',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to read'),
    }),
  },

  writeFile: {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: z.object({
      path: z.string().describe('Path to the file to write'),
      content: z.string().describe('Content to write to the file'),
    }),
  },

  runCommand: {
    name: 'run_command',
    description: 'Execute a shell command',
    inputSchema: z.object({
      command: z.string().describe('Command to execute'),
      cwd: z.string().optional().describe('Working directory'),
    }),
  },

  searchCode: {
    name: 'search_code',
    description: 'Search for code patterns in the repository',
    inputSchema: z.object({
      pattern: z.string().describe('Search pattern (regex supported)'),
      path: z.string().optional().describe('Path to search in'),
      fileTypes: z.array(z.string()).optional().describe('File extensions to search'),
    }),
  },

  gitStatus: {
    name: 'git_status',
    description: 'Get the current git status',
    inputSchema: z.object({}),
  },

  createPR: {
    name: 'create_pr',
    description: 'Create a pull request',
    inputSchema: z.object({
      title: z.string().describe('PR title'),
      body: z.string().describe('PR description'),
      branch: z.string().describe('Source branch'),
      base: z.string().optional().describe('Target branch (default: main)'),
    }),
  },

  syncState: {
    name: 'sync_state',
    description: 'Synchronize state with remote storage',
    inputSchema: z.object({
      direction: z.enum(['push', 'pull', 'bidirectional']).optional(),
      force: z.boolean().optional(),
    }),
  },

  hashData: {
    name: 'hash_data',
    description: 'Generate a hash of the provided data',
    inputSchema: z.object({
      data: z.string().describe('Data to hash'),
      algorithm: z.enum(['sha256', 'sha384', 'sha512', 'sha_infinity']).optional(),
    }),
  },
};

// Global task queue instance
export const taskQueue = new TaskQueue();

export default createAgentConfig;
