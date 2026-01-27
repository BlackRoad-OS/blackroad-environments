/**
 * BlackRoad Environments - Claude/Anthropic API Client
 *
 * Integration with Claude AI for agent orchestration,
 * code analysis, and intelligent automation.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  AgentConfig,
  AgentTask,
  AgentTool,
} from '../types/index.js';
import { hashId } from '../utils/hash.js';

export interface ClaudeConfig extends APIClientConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContentBlock[];
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class ClaudeClient extends BaseAPIClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly defaultMaxTokens: number;

  constructor(config: ClaudeConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.anthropic.com',
    });

    this.apiKey = config.apiKey;
    this.defaultModel = config.model ?? 'claude-opus-4-5-20251101';
    this.defaultMaxTokens = config.maxTokens ?? 8192;
  }

  /**
   * Health check for Claude API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        // Simple completion to verify API key works
        const response = await this.complete('Say "ok" and nothing else.');
        return { status: response.success ? 'healthy' : 'unhealthy' };
      },
      'claude:healthCheck'
    );
  }

  // ============================================
  // Message Operations
  // ============================================

  /**
   * Send a simple completion request
   */
  async complete(
    prompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      systemPrompt?: string;
      temperature?: number;
    }
  ): Promise<APIResponse<string>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.createMessage(
          [{ role: 'user', content: prompt }],
          {
            model: options?.model,
            maxTokens: options?.maxTokens,
            system: options?.systemPrompt,
            temperature: options?.temperature,
          }
        );

        if (!response.success || !response.data) {
          throw new Error('Failed to get completion');
        }

        const textContent = response.data.content.find(
          (block) => block.type === 'text'
        );

        return textContent?.text ?? '';
      },
      'claude:complete'
    );
  }

  /**
   * Create a message with full options
   */
  async createMessage(
    messages: ClaudeMessage[],
    options?: {
      model?: string;
      maxTokens?: number;
      system?: string;
      temperature?: number;
      tools?: ClaudeToolDefinition[];
      toolChoice?: { type: 'auto' | 'any' | 'tool'; name?: string };
    }
  ): Promise<APIResponse<ClaudeResponse>> {
    return this.executeWithRetry(
      async () => {
        return this.request<ClaudeResponse>('/v1/messages', 'POST', {
          model: options?.model ?? this.defaultModel,
          max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
          messages,
          ...(options?.system && { system: options.system }),
          ...(options?.temperature !== undefined && { temperature: options.temperature }),
          ...(options?.tools && { tools: options.tools }),
          ...(options?.toolChoice && { tool_choice: options.toolChoice }),
        });
      },
      'claude:createMessage'
    );
  }

  /**
   * Run a multi-turn conversation with tool use
   */
  async runConversation(
    initialPrompt: string,
    options: {
      system?: string;
      tools?: ClaudeToolDefinition[];
      toolHandlers?: Record<string, (input: Record<string, unknown>) => Promise<string>>;
      maxTurns?: number;
    }
  ): Promise<APIResponse<{ messages: ClaudeMessage[]; finalResponse: string }>> {
    return this.executeWithRetry(
      async () => {
        const messages: ClaudeMessage[] = [{ role: 'user', content: initialPrompt }];
        const maxTurns = options.maxTurns ?? 10;
        let turns = 0;

        while (turns < maxTurns) {
          turns++;

          const response = await this.createMessage(messages, {
            system: options.system,
            tools: options.tools,
          });

          if (!response.success || !response.data) {
            throw new Error('Failed to get response');
          }

          messages.push({
            role: 'assistant',
            content: response.data.content,
          });

          // Check if we need to handle tool use
          if (response.data.stop_reason === 'tool_use') {
            const toolUseBlocks = response.data.content.filter(
              (block) => block.type === 'tool_use'
            );

            const toolResults: ClaudeContentBlock[] = [];

            for (const toolUse of toolUseBlocks) {
              const handler = options.toolHandlers?.[toolUse.name ?? ''];

              if (handler && toolUse.id) {
                try {
                  const result = await handler(toolUse.input ?? {});
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: result,
                  });
                } catch (error) {
                  toolResults.push({
                    type: 'tool_result',
                    tool_use_id: toolUse.id,
                    content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  });
                }
              }
            }

            if (toolResults.length > 0) {
              messages.push({
                role: 'user',
                content: toolResults,
              });
            }
          } else {
            // Conversation complete
            const finalText = response.data.content.find(
              (block) => block.type === 'text'
            );

            return {
              messages,
              finalResponse: finalText?.text ?? '',
            };
          }
        }

        throw new Error(`Max turns (${maxTurns}) exceeded`);
      },
      'claude:runConversation'
    );
  }

  // ============================================
  // Agent Operations
  // ============================================

  /**
   * Create an agent task
   */
  async createAgentTask(
    description: string,
    options?: {
      type?: string;
      priority?: AgentTask['priority'];
      dependencies?: string[];
    }
  ): Promise<AgentTask> {
    const now = new Date().toISOString();

    return {
      id: hashId('task'),
      type: options?.type ?? 'general',
      priority: options?.priority ?? 'medium',
      status: 'pending',
      description,
      dependencies: options?.dependencies ?? [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Execute an agent task with Claude
   */
  async executeAgentTask(
    task: AgentTask,
    agentConfig: AgentConfig
  ): Promise<APIResponse<AgentTask>> {
    return this.executeWithRetry(
      async () => {
        // Update task status
        task.status = 'in_progress';
        task.assignedAgent = agentConfig.id;
        task.updatedAt = new Date().toISOString();

        // Build tool definitions from agent config
        const tools: ClaudeToolDefinition[] = agentConfig.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          input_schema: {
            type: 'object' as const,
            properties: {},
          },
        }));

        // Build tool handlers
        const toolHandlers: Record<string, (input: Record<string, unknown>) => Promise<string>> = {};
        for (const tool of agentConfig.tools) {
          toolHandlers[tool.name] = async (input) => {
            const result = await tool.handler(input);
            return JSON.stringify(result);
          };
        }

        // Run the conversation
        const result = await this.runConversation(
          `Execute this task: ${task.description}`,
          {
            system: agentConfig.systemPrompt,
            tools,
            toolHandlers,
          }
        );

        if (result.success) {
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          task.result = result.data?.finalResponse;
        } else {
          task.status = 'failed';
          task.error = result.error?.message;
        }

        task.updatedAt = new Date().toISOString();
        return task;
      },
      'claude:executeAgentTask'
    );
  }

  /**
   * Analyze code for potential issues
   */
  async analyzeCode(
    code: string,
    language: string,
    options?: { focus?: ('bugs' | 'security' | 'performance' | 'style')[] }
  ): Promise<APIResponse<{
    issues: { type: string; severity: string; message: string; line?: number }[];
    suggestions: string[];
  }>> {
    return this.executeWithRetry(
      async () => {
        const focusAreas = options?.focus?.join(', ') ?? 'bugs, security, performance, style';

        const prompt = `Analyze this ${language} code for issues. Focus on: ${focusAreas}.

\`\`\`${language}
${code}
\`\`\`

Respond with JSON in this format:
{
  "issues": [{"type": "...", "severity": "high|medium|low", "message": "...", "line": 1}],
  "suggestions": ["..."]
}`;

        const response = await this.complete(prompt, {
          temperature: 0,
        });

        if (!response.success || !response.data) {
          throw new Error('Failed to analyze code');
        }

        // Extract JSON from response
        const jsonMatch = response.data.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Failed to parse analysis response');
        }

        return JSON.parse(jsonMatch[0]);
      },
      'claude:analyzeCode'
    );
  }

  /**
   * Generate a PR description from diff
   */
  async generatePRDescription(
    diff: string,
    options?: { template?: string; maxLength?: number }
  ): Promise<APIResponse<{ title: string; description: string }>> {
    return this.executeWithRetry(
      async () => {
        const prompt = `Based on this git diff, generate a PR title and description.

${diff}

${options?.template ? `Use this template: ${options.template}` : ''}

Respond with JSON:
{
  "title": "Short descriptive title",
  "description": "Detailed description with bullet points of changes"
}`;

        const response = await this.complete(prompt, {
          maxTokens: options?.maxLength ?? 1000,
          temperature: 0.3,
        });

        if (!response.success || !response.data) {
          throw new Error('Failed to generate PR description');
        }

        const jsonMatch = response.data.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('Failed to parse PR description');
        }

        return JSON.parse(jsonMatch[0]);
      },
      'claude:generatePRDescription'
    );
  }

  // ============================================
  // Internal Request Helper
  // ============================================

  private async request<T>(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && !['GET', 'DELETE'].includes(method)) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${error}`);
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create and register Claude client
 */
export function createClaudeClient(config: ClaudeConfig): ClaudeClient {
  const client = new ClaudeClient(config);
  clientRegistry.register('claude', client);
  return client;
}

export default ClaudeClient;
