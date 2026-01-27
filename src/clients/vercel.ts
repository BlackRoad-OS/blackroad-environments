/**
 * BlackRoad Environments - Vercel API Client
 *
 * Integration with Vercel for deployments, projects,
 * environment variables, and edge functions.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  DeploymentConfig,
  DeploymentResult,
} from '../types/index.js';

export interface VercelConfig extends APIClientConfig {
  token: string;
  teamId?: string;
  projectId?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string;
  latestDeployments?: VercelDeployment[];
}

export interface VercelDeployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'ERROR' | 'INITIALIZING' | 'QUEUED' | 'READY' | 'CANCELED';
  created: number;
  buildingAt?: number;
  ready?: number;
  target?: 'production' | 'preview';
}

export interface VercelEnvVar {
  id: string;
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type: 'system' | 'encrypted' | 'plain' | 'secret';
}

export class VercelClient extends BaseAPIClient {
  private readonly token: string;
  private readonly teamId: string;
  private readonly projectId: string;

  constructor(config: VercelConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.vercel.com',
    });

    this.token = config.token;
    this.teamId = config.teamId ?? '';
    this.projectId = config.projectId ?? '';
  }

  /**
   * Health check for Vercel API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        const user = await this.request('/v2/user', 'GET');
        return { status: user ? 'healthy' : 'unhealthy' };
      },
      'vercel:healthCheck'
    );
  }

  // ============================================
  // Project Operations
  // ============================================

  /**
   * List all projects
   */
  async listProjects(): Promise<APIResponse<VercelProject[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ projects: VercelProject[] }>(
          `/v9/projects${this.teamQuery()}`,
          'GET'
        );
        return response.projects;
      },
      'vercel:listProjects'
    );
  }

  /**
   * Get project details
   */
  async getProject(projectId?: string): Promise<APIResponse<VercelProject>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        return this.request<VercelProject>(
          `/v9/projects/${id}${this.teamQuery()}`,
          'GET'
        );
      },
      'vercel:getProject'
    );
  }

  /**
   * Create a new project
   */
  async createProject(
    name: string,
    options?: {
      framework?: string;
      gitRepository?: { repo: string; type: 'github' | 'gitlab' | 'bitbucket' };
      buildCommand?: string;
      outputDirectory?: string;
      installCommand?: string;
    }
  ): Promise<APIResponse<VercelProject>> {
    return this.executeWithRetry(
      async () => {
        return this.request<VercelProject>(
          `/v10/projects${this.teamQuery()}`,
          'POST',
          {
            name,
            ...options,
          }
        );
      },
      'vercel:createProject'
    );
  }

  // ============================================
  // Deployment Operations
  // ============================================

  /**
   * List deployments
   */
  async listDeployments(
    projectId?: string,
    options?: { limit?: number; target?: 'production' | 'preview' }
  ): Promise<APIResponse<VercelDeployment[]>> {
    return this.executeWithRetry(
      async () => {
        const params = new URLSearchParams();
        if (projectId ?? this.projectId) {
          params.append('projectId', projectId ?? this.projectId);
        }
        if (options?.limit) {
          params.append('limit', options.limit.toString());
        }
        if (options?.target) {
          params.append('target', options.target);
        }

        const response = await this.request<{ deployments: VercelDeployment[] }>(
          `/v6/deployments${this.teamQuery()}&${params.toString()}`,
          'GET'
        );
        return response.deployments;
      },
      'vercel:listDeployments'
    );
  }

  /**
   * Get deployment details
   */
  async getDeployment(deploymentId: string): Promise<APIResponse<VercelDeployment>> {
    return this.executeWithRetry(
      async () => {
        return this.request<VercelDeployment>(
          `/v13/deployments/${deploymentId}${this.teamQuery()}`,
          'GET'
        );
      },
      'vercel:getDeployment'
    );
  }

  /**
   * Create a deployment from git
   */
  async deploy(config: DeploymentConfig): Promise<APIResponse<DeploymentResult>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<VercelDeployment>(
          `/v13/deployments${this.teamQuery()}`,
          'POST',
          {
            name: config.projectId,
            target: config.environment === 'production' ? 'production' : 'preview',
            gitSource: config.branch ? { ref: config.branch } : undefined,
            projectSettings: config.env ? { environmentVariables: config.env } : undefined,
          }
        );

        return {
          id: response.uid,
          url: `https://${response.url}`,
          status: this.mapDeploymentState(response.state),
          createdAt: new Date(response.created).toISOString(),
          readyAt: response.ready ? new Date(response.ready).toISOString() : undefined,
        };
      },
      'vercel:deploy'
    );
  }

  /**
   * Cancel a deployment
   */
  async cancelDeployment(deploymentId: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(
          `/v12/deployments/${deploymentId}/cancel${this.teamQuery()}`,
          'PATCH'
        );
        return true;
      },
      'vercel:cancelDeployment'
    );
  }

  // ============================================
  // Environment Variables
  // ============================================

  /**
   * List environment variables
   */
  async listEnvVars(projectId?: string): Promise<APIResponse<VercelEnvVar[]>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        const response = await this.request<{ envs: VercelEnvVar[] }>(
          `/v9/projects/${id}/env${this.teamQuery()}`,
          'GET'
        );
        return response.envs;
      },
      'vercel:listEnvVars'
    );
  }

  /**
   * Create environment variable
   */
  async createEnvVar(
    key: string,
    value: string,
    target: ('production' | 'preview' | 'development')[],
    projectId?: string
  ): Promise<APIResponse<VercelEnvVar>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        return this.request<VercelEnvVar>(
          `/v10/projects/${id}/env${this.teamQuery()}`,
          'POST',
          {
            key,
            value,
            target,
            type: 'encrypted',
          }
        );
      },
      'vercel:createEnvVar'
    );
  }

  /**
   * Delete environment variable
   */
  async deleteEnvVar(envVarId: string, projectId?: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        await this.request(
          `/v9/projects/${id}/env/${envVarId}${this.teamQuery()}`,
          'DELETE'
        );
        return true;
      },
      'vercel:deleteEnvVar'
    );
  }

  // ============================================
  // Domains
  // ============================================

  /**
   * List project domains
   */
  async listDomains(projectId?: string): Promise<APIResponse<{ name: string; verified: boolean }[]>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        const response = await this.request<{ domains: { name: string; verified: boolean }[] }>(
          `/v9/projects/${id}/domains${this.teamQuery()}`,
          'GET'
        );
        return response.domains;
      },
      'vercel:listDomains'
    );
  }

  /**
   * Add domain to project
   */
  async addDomain(domain: string, projectId?: string): Promise<APIResponse<{ name: string }>> {
    return this.executeWithRetry(
      async () => {
        const id = projectId ?? this.projectId;
        return this.request<{ name: string }>(
          `/v10/projects/${id}/domains${this.teamQuery()}`,
          'POST',
          { name: domain }
        );
      },
      'vercel:addDomain'
    );
  }

  // ============================================
  // Helper Methods
  // ============================================

  private teamQuery(): string {
    return this.teamId ? `?teamId=${this.teamId}` : '';
  }

  private mapDeploymentState(state: VercelDeployment['state']): DeploymentResult['status'] {
    switch (state) {
      case 'BUILDING':
      case 'INITIALIZING':
      case 'QUEUED':
        return 'building';
      case 'READY':
        return 'ready';
      case 'ERROR':
        return 'error';
      case 'CANCELED':
        return 'canceled';
      default:
        return 'building';
    }
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
      throw new Error(`Vercel API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create and register Vercel client
 */
export function createVercelClient(config: VercelConfig): VercelClient {
  const client = new VercelClient(config);
  clientRegistry.register('vercel', client);
  return client;
}

export default VercelClient;
