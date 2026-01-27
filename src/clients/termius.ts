/**
 * BlackRoad Environments - Termius API Client
 *
 * Integration with Termius for SSH host management,
 * key synchronization, and remote server orchestration.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type { APIClientConfig, APIResponse } from '../types/index.js';

export interface TermiusConfig extends APIClientConfig {
  apiKey: string;
  teamId?: string;
}

export interface TermiusHost {
  id: string;
  label: string;
  address: string;
  port: number;
  username?: string;
  ssh_key_id?: string;
  group_id?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TermiusGroup {
  id: string;
  label: string;
  parent_id?: string;
  hosts: string[];
  created_at: string;
}

export interface TermiusSSHKey {
  id: string;
  label: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
}

export interface TermiusSnippet {
  id: string;
  label: string;
  content: string;
  tags: string[];
  created_at: string;
}

export class TermiusClient extends BaseAPIClient {
  private readonly apiKey: string;
  private readonly teamId: string;

  constructor(config: TermiusConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.termius.com/v1',
    });

    this.apiKey = config.apiKey;
    this.teamId = config.teamId ?? '';
  }

  /**
   * Health check for Termius API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        const hosts = await this.listHosts();
        return { status: hosts.success ? 'healthy' : 'unhealthy' };
      },
      'termius:healthCheck'
    );
  }

  // ============================================
  // Host Operations
  // ============================================

  /**
   * List all hosts
   */
  async listHosts(): Promise<APIResponse<TermiusHost[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ hosts: TermiusHost[] }>('/hosts', 'GET');
        return response.hosts ?? [];
      },
      'termius:listHosts'
    );
  }

  /**
   * Get host by ID
   */
  async getHost(hostId: string): Promise<APIResponse<TermiusHost>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusHost>(`/hosts/${hostId}`, 'GET');
      },
      'termius:getHost'
    );
  }

  /**
   * Create a new host
   */
  async createHost(host: {
    label: string;
    address: string;
    port?: number;
    username?: string;
    ssh_key_id?: string;
    group_id?: string;
    tags?: string[];
  }): Promise<APIResponse<TermiusHost>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusHost>('/hosts', 'POST', {
          label: host.label,
          address: host.address,
          port: host.port ?? 22,
          username: host.username,
          ssh_key_id: host.ssh_key_id,
          group_id: host.group_id,
          tags: host.tags ?? [],
        });
      },
      'termius:createHost'
    );
  }

  /**
   * Update a host
   */
  async updateHost(
    hostId: string,
    updates: Partial<Omit<TermiusHost, 'id' | 'created_at' | 'updated_at'>>
  ): Promise<APIResponse<TermiusHost>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusHost>(`/hosts/${hostId}`, 'PATCH', updates);
      },
      'termius:updateHost'
    );
  }

  /**
   * Delete a host
   */
  async deleteHost(hostId: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(`/hosts/${hostId}`, 'DELETE');
        return true;
      },
      'termius:deleteHost'
    );
  }

  // ============================================
  // Group Operations
  // ============================================

  /**
   * List all groups
   */
  async listGroups(): Promise<APIResponse<TermiusGroup[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ groups: TermiusGroup[] }>('/groups', 'GET');
        return response.groups ?? [];
      },
      'termius:listGroups'
    );
  }

  /**
   * Create a group
   */
  async createGroup(label: string, parentId?: string): Promise<APIResponse<TermiusGroup>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusGroup>('/groups', 'POST', {
          label,
          parent_id: parentId,
        });
      },
      'termius:createGroup'
    );
  }

  /**
   * Delete a group
   */
  async deleteGroup(groupId: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(`/groups/${groupId}`, 'DELETE');
        return true;
      },
      'termius:deleteGroup'
    );
  }

  // ============================================
  // SSH Key Operations
  // ============================================

  /**
   * List all SSH keys
   */
  async listSSHKeys(): Promise<APIResponse<TermiusSSHKey[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ keys: TermiusSSHKey[] }>('/ssh-keys', 'GET');
        return response.keys ?? [];
      },
      'termius:listSSHKeys'
    );
  }

  /**
   * Create an SSH key
   */
  async createSSHKey(label: string, publicKey: string): Promise<APIResponse<TermiusSSHKey>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusSSHKey>('/ssh-keys', 'POST', {
          label,
          public_key: publicKey,
        });
      },
      'termius:createSSHKey'
    );
  }

  /**
   * Delete an SSH key
   */
  async deleteSSHKey(keyId: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(`/ssh-keys/${keyId}`, 'DELETE');
        return true;
      },
      'termius:deleteSSHKey'
    );
  }

  // ============================================
  // Snippet Operations
  // ============================================

  /**
   * List all snippets
   */
  async listSnippets(): Promise<APIResponse<TermiusSnippet[]>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request<{ snippets: TermiusSnippet[] }>('/snippets', 'GET');
        return response.snippets ?? [];
      },
      'termius:listSnippets'
    );
  }

  /**
   * Create a snippet
   */
  async createSnippet(
    label: string,
    content: string,
    tags?: string[]
  ): Promise<APIResponse<TermiusSnippet>> {
    return this.executeWithRetry(
      async () => {
        return this.request<TermiusSnippet>('/snippets', 'POST', {
          label,
          content,
          tags: tags ?? [],
        });
      },
      'termius:createSnippet'
    );
  }

  /**
   * Delete a snippet
   */
  async deleteSnippet(snippetId: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        await this.request(`/snippets/${snippetId}`, 'DELETE');
        return true;
      },
      'termius:deleteSnippet'
    );
  }

  // ============================================
  // Bulk Operations
  // ============================================

  /**
   * Export all configuration
   */
  async exportConfig(): Promise<APIResponse<{
    hosts: TermiusHost[];
    groups: TermiusGroup[];
    keys: TermiusSSHKey[];
    snippets: TermiusSnippet[];
  }>> {
    return this.executeWithRetry(
      async () => {
        const [hosts, groups, keys, snippets] = await Promise.all([
          this.listHosts(),
          this.listGroups(),
          this.listSSHKeys(),
          this.listSnippets(),
        ]);

        return {
          hosts: hosts.data ?? [],
          groups: groups.data ?? [],
          keys: keys.data ?? [],
          snippets: snippets.data ?? [],
        };
      },
      'termius:exportConfig'
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
      Authorization: `Bearer ${this.apiKey}`,
    };

    if (this.teamId) {
      headers['X-Team-Id'] = this.teamId;
    }

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
      throw new Error(`Termius API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }
}

/**
 * Create and register Termius client
 */
export function createTermiusClient(config: TermiusConfig): TermiusClient {
  const client = new TermiusClient(config);
  clientRegistry.register('termius', client);
  return client;
}

export default TermiusClient;
