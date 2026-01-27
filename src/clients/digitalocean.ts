/**
 * BlackRoad Environments - Digital Ocean API Client
 *
 * Integration with Digital Ocean for App Platform, Droplets,
 * Spaces (S3-compatible storage), and managed databases.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  DeploymentConfig,
  DeploymentResult,
} from '../types/index.js';

export interface DigitalOceanConfig extends APIClientConfig {
  token: string;
  spacesKey?: string;
  spacesSecret?: string;
  spacesEndpoint?: string;
  appId?: string;
}

export interface DOApp {
  id: string;
  owner_uuid: string;
  spec: DOAppSpec;
  default_ingress: string;
  created_at: string;
  updated_at: string;
  active_deployment?: DODeployment;
  in_progress_deployment?: DODeployment;
}

export interface DOAppSpec {
  name: string;
  region: string;
  services?: DOService[];
  workers?: DOWorker[];
  jobs?: DOJob[];
  databases?: DODatabase[];
}

export interface DOService {
  name: string;
  git?: { repo_clone_url: string; branch: string };
  github?: { repo: string; branch: string };
  http_port?: number;
  instance_count?: number;
  instance_size_slug?: string;
  routes?: { path: string }[];
  envs?: { key: string; value: string }[];
}

export interface DOWorker {
  name: string;
  git?: { repo_clone_url: string; branch: string };
  instance_count?: number;
  instance_size_slug?: string;
}

export interface DOJob {
  name: string;
  kind: 'PRE_DEPLOY' | 'POST_DEPLOY' | 'FAILED_DEPLOY';
  git?: { repo_clone_url: string; branch: string };
}

export interface DODatabase {
  name: string;
  engine: 'PG' | 'MYSQL' | 'REDIS' | 'MONGODB';
  production?: boolean;
}

export interface DODeployment {
  id: string;
  spec: DOAppSpec;
  services?: { name: string; source_commit_hash: string }[];
  phase: 'UNKNOWN' | 'PENDING_BUILD' | 'BUILDING' | 'PENDING_DEPLOY' | 'DEPLOYING' | 'ACTIVE' | 'SUPERSEDED' | 'ERROR' | 'CANCELED';
  created_at: string;
  updated_at: string;
  progress?: { steps: { name: string; status: string }[] };
}

export interface DODroplet {
  id: number;
  name: string;
  status: 'new' | 'active' | 'off' | 'archive';
  memory: number;
  vcpus: number;
  disk: number;
  region: { slug: string; name: string };
  image: { slug: string; name: string };
  networks: { v4: { ip_address: string; type: string }[] };
  tags: string[];
}

export class DigitalOceanClient extends BaseAPIClient {
  private readonly token: string;
  private readonly appId: string;

  constructor(config: DigitalOceanConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.digitalocean.com/v2',
    });

    this.token = config.token;
    this.appId = config.appId ?? '';
  }

  /**
   * Health check for Digital Ocean API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        const account = await this.request('/account', 'GET');
        return { status: account ? 'healthy' : 'unhealthy' };
      },
      'digitalocean:healthCheck'
    );
  }

  // ============================================
  // App Platform Operations
  // ============================================

  /**
   * List all apps
   */
  async listApps(): Promise<APIResponse<DOApp[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ apps: DOApp[] }>('/apps', 'GET');
        return response.apps ?? [];
      },
      'digitalocean:listApps'
    );
  }

  /**
   * Get app details
   */
  async getApp(appId?: string): Promise<APIResponse<DOApp>> {
    return this.executeWithRetry(
      async () => {
        const id = appId ?? this.appId;
        const response = await this.request<{ app: DOApp }>(`/apps/${id}`, 'GET');
        return response.app;
      },
      'digitalocean:getApp'
    );
  }

  /**
   * Create a new app
   */
  async createApp(spec: DOAppSpec): Promise<APIResponse<DOApp>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ app: DOApp }>('/apps', 'POST', { spec });
        return response.app;
      },
      'digitalocean:createApp'
    );
  }

  /**
   * Update app spec
   */
  async updateApp(spec: DOAppSpec, appId?: string): Promise<APIResponse<DOApp>> {
    return this.executeWithRetry(
      async () => {
        const id = appId ?? this.appId;
        const response = await this.request<{ app: DOApp }>(`/apps/${id}`, 'PUT', { spec });
        return response.app;
      },
      'digitalocean:updateApp'
    );
  }

  /**
   * Deploy app (create deployment)
   */
  async deploy(config: DeploymentConfig): Promise<APIResponse<DeploymentResult>> {
    return this.executeWithRetry(
      async () => {
        const id = config.projectId || this.appId;
        const response = await this.request<{ deployment: DODeployment }>(
          `/apps/${id}/deployments`,
          'POST',
          { force_build: true }
        );

        const deployment = response.deployment;

        return {
          id: deployment.id,
          url: '', // URL will be available after deployment
          status: this.mapDeploymentPhase(deployment.phase),
          createdAt: deployment.created_at,
        };
      },
      'digitalocean:deploy'
    );
  }

  /**
   * List app deployments
   */
  async listDeployments(appId?: string): Promise<APIResponse<DODeployment[]>> {
    return this.executeWithRetry(
      async () => {
        const id = appId ?? this.appId;
        const response = await this.request<{ deployments: DODeployment[] }>(
          `/apps/${id}/deployments`,
          'GET'
        );
        return response.deployments ?? [];
      },
      'digitalocean:listDeployments'
    );
  }

  /**
   * Get deployment details
   */
  async getDeployment(deploymentId: string, appId?: string): Promise<APIResponse<DODeployment>> {
    return this.executeWithRetry(
      async () => {
        const id = appId ?? this.appId;
        const response = await this.request<{ deployment: DODeployment }>(
          `/apps/${id}/deployments/${deploymentId}`,
          'GET'
        );
        return response.deployment;
      },
      'digitalocean:getDeployment'
    );
  }

  /**
   * Cancel deployment
   */
  async cancelDeployment(deploymentId: string, appId?: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        const id = appId ?? this.appId;
        await this.request(
          `/apps/${id}/deployments/${deploymentId}/cancel`,
          'POST'
        );
        return true;
      },
      'digitalocean:cancelDeployment'
    );
  }

  // ============================================
  // Droplet Operations
  // ============================================

  /**
   * List all droplets
   */
  async listDroplets(tag?: string): Promise<APIResponse<DODroplet[]>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = tag ? `/droplets?tag_name=${tag}` : '/droplets';
        const response = await this.request<{ droplets: DODroplet[] }>(endpoint, 'GET');
        return response.droplets ?? [];
      },
      'digitalocean:listDroplets'
    );
  }

  /**
   * Get droplet details
   */
  async getDroplet(dropletId: number): Promise<APIResponse<DODroplet>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ droplet: DODroplet }>(
          `/droplets/${dropletId}`,
          'GET'
        );
        return response.droplet;
      },
      'digitalocean:getDroplet'
    );
  }

  /**
   * Create a droplet
   */
  async createDroplet(options: {
    name: string;
    region: string;
    size: string;
    image: string | number;
    ssh_keys?: (string | number)[];
    backups?: boolean;
    ipv6?: boolean;
    user_data?: string;
    tags?: string[];
  }): Promise<APIResponse<DODroplet>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ droplet: DODroplet }>(
          '/droplets',
          'POST',
          options
        );
        return response.droplet;
      },
      'digitalocean:createDroplet'
    );
  }

  /**
   * Delete a droplet
   */
  async deleteDroplet(dropletId: number): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(`/droplets/${dropletId}`, 'DELETE');
        return true;
      },
      'digitalocean:deleteDroplet'
    );
  }

  /**
   * Perform droplet action
   */
  async dropletAction(
    dropletId: number,
    action: 'power_on' | 'power_off' | 'reboot' | 'shutdown' | 'snapshot'
  ): Promise<APIResponse<{ action_id: number }>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ action: { id: number } }>(
          `/droplets/${dropletId}/actions`,
          'POST',
          { type: action }
        );
        return { action_id: response.action.id };
      },
      'digitalocean:dropletAction'
    );
  }

  // ============================================
  // SSH Keys
  // ============================================

  /**
   * List SSH keys
   */
  async listSSHKeys(): Promise<APIResponse<{ id: number; name: string; fingerprint: string }[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{
          ssh_keys: { id: number; name: string; fingerprint: string }[];
        }>('/account/keys', 'GET');
        return response.ssh_keys ?? [];
      },
      'digitalocean:listSSHKeys'
    );
  }

  // ============================================
  // Helper Methods
  // ============================================

  private mapDeploymentPhase(phase: DODeployment['phase']): DeploymentResult['status'] {
    switch (phase) {
      case 'PENDING_BUILD':
      case 'BUILDING':
      case 'PENDING_DEPLOY':
      case 'DEPLOYING':
        return 'building';
      case 'ACTIVE':
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
      throw new Error(`Digital Ocean API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create and register Digital Ocean client
 */
export function createDigitalOceanClient(config: DigitalOceanConfig): DigitalOceanClient {
  const client = new DigitalOceanClient(config);
  clientRegistry.register('digitalocean', client);
  return client;
}

export default DigitalOceanClient;
