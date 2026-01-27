/**
 * BlackRoad Environments - GitHub API Client
 *
 * Integration with GitHub for Projects (v2), Issues, Pull Requests,
 * and repository management. Supports both REST and GraphQL APIs.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  GitHubProject,
  ProjectField,
  ProjectItem,
  PRValidationResult,
  ValidationCheck,
} from '../types/index.js';
import { sha256 } from '../utils/hash.js';

export interface GitHubConfig extends APIClientConfig {
  token: string;
  owner: string;
  repo: string;
  projectNumber?: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: { name: string }[];
  assignees: { login: string }[];
  milestone?: { title: string };
  created_at: string;
  updated_at: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
  labels: { name: string }[];
  assignees: { login: string }[];
  reviewers: { login: string }[];
  mergeable: boolean | null;
  mergeable_state: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  started_at: string;
  completed_at: string | null;
}

export class GitHubClient extends BaseAPIClient {
  private readonly token: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly projectNumber: number;

  constructor(config: GitHubConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.github.com',
    });

    this.token = config.token;
    this.owner = config.owner;
    this.repo = config.repo;
    this.projectNumber = config.projectNumber ?? 0;
  }

  /**
   * Health check for GitHub API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request('/user', 'GET');
        return { status: response ? 'healthy' : 'unhealthy' };
      },
      'github:healthCheck'
    );
  }

  // ============================================
  // GitHub Projects (v2) Operations
  // ============================================

  /**
   * Get project details using GraphQL
   */
  async getProject(projectNumber?: number): Promise<APIResponse<GitHubProject>> {
    return this.executeWithRetry(
      async () => {
        const num = projectNumber ?? this.projectNumber;

        const query = `
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              projectV2(number: $number) {
                id
                number
                title
                shortDescription
                url
                closed
                fields(first: 50) {
                  nodes {
                    ... on ProjectV2Field {
                      id
                      name
                      dataType
                    }
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      dataType
                      options {
                        id
                        name
                        color
                      }
                    }
                    ... on ProjectV2IterationField {
                      id
                      name
                      dataType
                    }
                  }
                }
                items(first: 100) {
                  nodes {
                    id
                    type
                    content {
                      ... on Issue {
                        title
                        number
                        labels(first: 10) {
                          nodes { name }
                        }
                        assignees(first: 5) {
                          nodes { login }
                        }
                      }
                      ... on PullRequest {
                        title
                        number
                        labels(first: 10) {
                          nodes { name }
                        }
                        assignees(first: 5) {
                          nodes { login }
                        }
                      }
                      ... on DraftIssue {
                        title
                      }
                    }
                    fieldValues(first: 20) {
                      nodes {
                        ... on ProjectV2ItemFieldTextValue {
                          field { ... on ProjectV2Field { name } }
                          text
                        }
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          field { ... on ProjectV2SingleSelectField { name } }
                          name
                        }
                        ... on ProjectV2ItemFieldNumberValue {
                          field { ... on ProjectV2Field { name } }
                          number
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const response = await this.graphql<{
          repository: {
            projectV2: {
              id: string;
              number: number;
              title: string;
              shortDescription: string;
              url: string;
              closed: boolean;
              fields: { nodes: ProjectField[] };
              items: { nodes: unknown[] };
            };
          };
        }>(query, {
          owner: this.owner,
          repo: this.repo,
          number: num,
        });

        const project = response.repository.projectV2;

        return {
          id: project.id,
          number: project.number,
          title: project.title,
          description: project.shortDescription,
          url: project.url,
          closed: project.closed,
          fields: project.fields.nodes,
          items: this.transformProjectItems(project.items.nodes),
        };
      },
      'github:getProject'
    );
  }

  /**
   * Create a project item
   */
  async createProjectItem(
    projectId: string,
    contentId: string
  ): Promise<APIResponse<{ itemId: string }>> {
    return this.executeWithRetry(
      async () => {
        const mutation = `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {
              projectId: $projectId,
              contentId: $contentId
            }) {
              item { id }
            }
          }
        `;

        const response = await this.graphql<{
          addProjectV2ItemById: { item: { id: string } };
        }>(mutation, { projectId, contentId });

        return { itemId: response.addProjectV2ItemById.item.id };
      },
      'github:createProjectItem'
    );
  }

  /**
   * Update project item field
   */
  async updateProjectItemField(
    projectId: string,
    itemId: string,
    fieldId: string,
    value: string | number | { singleSelectOptionId: string }
  ): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        let mutation: string;
        let variables: Record<string, unknown>;

        if (typeof value === 'object' && 'singleSelectOptionId' in value) {
          mutation = `
            mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId,
                itemId: $itemId,
                fieldId: $fieldId,
                value: { singleSelectOptionId: $value }
              }) { clientMutationId }
            }
          `;
          variables = {
            projectId,
            itemId,
            fieldId,
            value: value.singleSelectOptionId,
          };
        } else {
          mutation = `
            mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId,
                itemId: $itemId,
                fieldId: $fieldId,
                value: { text: $value }
              }) { clientMutationId }
            }
          `;
          variables = { projectId, itemId, fieldId, value: String(value) };
        }

        await this.graphql(mutation, variables);
        return true;
      },
      'github:updateProjectItemField'
    );
  }

  // ============================================
  // Issue Operations
  // ============================================

  /**
   * List issues
   */
  async listIssues(options?: {
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    per_page?: number;
  }): Promise<APIResponse<GitHubIssue[]>> {
    return this.executeWithRetry(
      async () => {
        const params = new URLSearchParams();
        if (options?.state) params.append('state', options.state);
        if (options?.labels) params.append('labels', options.labels.join(','));
        if (options?.assignee) params.append('assignee', options.assignee);
        if (options?.per_page) params.append('per_page', options.per_page.toString());

        return this.request<GitHubIssue[]>(
          `/repos/${this.owner}/${this.repo}/issues?${params.toString()}`,
          'GET'
        );
      },
      'github:listIssues'
    );
  }

  /**
   * Create an issue
   */
  async createIssue(
    title: string,
    body?: string,
    options?: { labels?: string[]; assignees?: string[]; milestone?: number }
  ): Promise<APIResponse<GitHubIssue>> {
    return this.executeWithRetry(
      async () => {
        return this.request<GitHubIssue>(
          `/repos/${this.owner}/${this.repo}/issues`,
          'POST',
          {
            title,
            body,
            labels: options?.labels,
            assignees: options?.assignees,
            milestone: options?.milestone,
          }
        );
      },
      'github:createIssue'
    );
  }

  /**
   * Update an issue
   */
  async updateIssue(
    issueNumber: number,
    updates: Partial<{
      title: string;
      body: string;
      state: 'open' | 'closed';
      labels: string[];
      assignees: string[];
    }>
  ): Promise<APIResponse<GitHubIssue>> {
    return this.executeWithRetry(
      async () => {
        return this.request<GitHubIssue>(
          `/repos/${this.owner}/${this.repo}/issues/${issueNumber}`,
          'PATCH',
          updates
        );
      },
      'github:updateIssue'
    );
  }

  // ============================================
  // Pull Request Operations
  // ============================================

  /**
   * List pull requests
   */
  async listPRs(options?: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    per_page?: number;
  }): Promise<APIResponse<GitHubPR[]>> {
    return this.executeWithRetry(
      async () => {
        const params = new URLSearchParams();
        if (options?.state) params.append('state', options.state);
        if (options?.head) params.append('head', options.head);
        if (options?.base) params.append('base', options.base);
        if (options?.per_page) params.append('per_page', options.per_page.toString());

        return this.request<GitHubPR[]>(
          `/repos/${this.owner}/${this.repo}/pulls?${params.toString()}`,
          'GET'
        );
      },
      'github:listPRs'
    );
  }

  /**
   * Get a pull request
   */
  async getPR(prNumber: number): Promise<APIResponse<GitHubPR>> {
    return this.executeWithRetry(
      async () => {
        return this.request<GitHubPR>(
          `/repos/${this.owner}/${this.repo}/pulls/${prNumber}`,
          'GET'
        );
      },
      'github:getPR'
    );
  }

  /**
   * Create a pull request
   */
  async createPR(
    title: string,
    head: string,
    base: string,
    body?: string,
    options?: { draft?: boolean }
  ): Promise<APIResponse<GitHubPR>> {
    return this.executeWithRetry(
      async () => {
        return this.request<GitHubPR>(
          `/repos/${this.owner}/${this.repo}/pulls`,
          'POST',
          {
            title,
            head,
            base,
            body,
            draft: options?.draft,
          }
        );
      },
      'github:createPR'
    );
  }

  /**
   * Get PR check runs
   */
  async getPRChecks(prNumber: number): Promise<APIResponse<GitHubCheckRun[]>> {
    return this.executeWithRetry(
      async () => {
        // First get the PR to get the head SHA
        const pr = await this.getPR(prNumber);
        if (!pr.success || !pr.data) {
          throw new Error('Failed to get PR');
        }

        const response = await this.request<{ check_runs: GitHubCheckRun[] }>(
          `/repos/${this.owner}/${this.repo}/commits/${pr.data.head.sha}/check-runs`,
          'GET'
        );

        return response.check_runs;
      },
      'github:getPRChecks'
    );
  }

  /**
   * Validate PR readiness
   */
  async validatePR(prNumber: number): Promise<APIResponse<PRValidationResult>> {
    return this.executeWithRetry(
      async () => {
        const [pr, checks] = await Promise.all([
          this.getPR(prNumber),
          this.getPRChecks(prNumber),
        ]);

        if (!pr.success || !pr.data) {
          throw new Error('Failed to get PR');
        }

        const prData = pr.data;
        const checksData = checks.data ?? [];

        const validationChecks: ValidationCheck[] = [];
        const blockers: string[] = [];
        const warnings: string[] = [];

        // Check if PR is draft
        if (prData.draft) {
          validationChecks.push({
            name: 'draft_status',
            status: 'failed',
            message: 'PR is still in draft mode',
          });
          blockers.push('PR is in draft mode');
        } else {
          validationChecks.push({
            name: 'draft_status',
            status: 'passed',
          });
        }

        // Check mergeability
        if (prData.mergeable === false) {
          validationChecks.push({
            name: 'mergeable',
            status: 'failed',
            message: 'PR has merge conflicts',
          });
          blockers.push('Merge conflicts detected');
        } else if (prData.mergeable === null) {
          validationChecks.push({
            name: 'mergeable',
            status: 'pending',
            message: 'Mergeability check in progress',
          });
        } else {
          validationChecks.push({
            name: 'mergeable',
            status: 'passed',
          });
        }

        // Check CI status
        for (const check of checksData) {
          if (check.status === 'completed') {
            const passed = check.conclusion === 'success' || check.conclusion === 'skipped';
            validationChecks.push({
              name: check.name,
              status: passed ? 'passed' : 'failed',
              message: passed ? undefined : `Check failed: ${check.conclusion}`,
            });

            if (!passed && check.conclusion !== 'neutral') {
              blockers.push(`CI check "${check.name}" failed`);
            }
          } else {
            validationChecks.push({
              name: check.name,
              status: 'pending',
              message: `Status: ${check.status}`,
            });
            warnings.push(`CI check "${check.name}" still running`);
          }
        }

        // Check for required labels
        const hasWIPLabel = prData.labels.some(l =>
          l.name.toLowerCase().includes('wip') ||
          l.name.toLowerCase().includes('work in progress')
        );

        if (hasWIPLabel) {
          validationChecks.push({
            name: 'wip_label',
            status: 'failed',
            message: 'PR has WIP label',
          });
          blockers.push('Remove WIP label before merging');
        }

        const valid = blockers.length === 0;
        const hash = sha256(JSON.stringify({ prNumber, checks: validationChecks }));

        return {
          valid,
          checks: validationChecks,
          blockers,
          warnings,
          hash,
        };
      },
      'github:validatePR'
    );
  }

  // ============================================
  // Internal Helpers
  // ============================================

  private transformProjectItems(nodes: unknown[]): ProjectItem[] {
    return nodes.map((node: unknown) => {
      const item = node as Record<string, unknown>;
      const content = item['content'] as Record<string, unknown> | undefined;
      const fieldValues = item['fieldValues'] as { nodes: unknown[] } | undefined;

      const fields: Record<string, unknown> = {};
      if (fieldValues?.nodes) {
        for (const fv of fieldValues.nodes) {
          const fieldValue = fv as Record<string, unknown>;
          const field = fieldValue['field'] as Record<string, string> | undefined;
          if (field?.name) {
            fields[field.name] = fieldValue['text'] ?? fieldValue['name'] ?? fieldValue['number'];
          }
        }
      }

      return {
        id: item['id'] as string,
        type: item['type'] as 'ISSUE' | 'PULL_REQUEST' | 'DRAFT_ISSUE',
        title: content?.['title'] as string ?? 'Untitled',
        status: fields['Status'] as string | undefined,
        priority: fields['Priority'] as string | undefined,
        assignees: ((content?.['assignees'] as { nodes: { login: string }[] })?.nodes ?? [])
          .map(a => a.login),
        labels: ((content?.['labels'] as { nodes: { name: string }[] })?.nodes ?? [])
          .map(l => l.name),
        fieldValues: fields,
      };
    });
  }

  private async request<T>(
    endpoint: string,
    method: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
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
      throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const url = 'https://api.github.com/graphql';
    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      Authorization: `Bearer ${this.token}`,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub GraphQL error: ${response.status} - ${error}`);
    }

    const result = await response.json() as { data: T; errors?: unknown[] };

    if (result.errors) {
      throw new Error(`GitHub GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }
}

/**
 * Create and register GitHub client
 */
export function createGitHubClient(config: GitHubConfig): GitHubClient {
  const client = new GitHubClient(config);
  clientRegistry.register('github', client);
  return client;
}

export default GitHubClient;
