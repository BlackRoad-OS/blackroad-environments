/**
 * BlackRoad Environments - Cloudflare API Client
 *
 * Integration with Cloudflare Workers, KV, D1, R2, and DNS.
 * Used as primary state storage and edge computing platform.
 */

import { BaseAPIClient, clientRegistry } from './base.js';
import type {
  APIClientConfig,
  APIResponse,
  CloudflareKVEntry,
  CloudflareD1Result,
  CloudflareWorkerState,
} from '../types/index.js';
import { hashState } from '../utils/hash.js';

export interface CloudflareConfig extends APIClientConfig {
  accountId: string;
  zoneId?: string;
  kvNamespaceId?: string;
  d1DatabaseId?: string;
  r2BucketName?: string;
}

export class CloudflareClient extends BaseAPIClient {
  private readonly accountId: string;
  private readonly zoneId: string;
  private readonly kvNamespaceId: string;
  private readonly d1DatabaseId: string;
  private readonly r2BucketName: string;

  constructor(config: CloudflareConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl ?? 'https://api.cloudflare.com/client/v4',
    });

    this.accountId = config.accountId;
    this.zoneId = config.zoneId ?? '';
    this.kvNamespaceId = config.kvNamespaceId ?? '';
    this.d1DatabaseId = config.d1DatabaseId ?? '';
    this.r2BucketName = config.r2BucketName ?? '';
  }

  /**
   * Health check for Cloudflare API
   */
  async healthCheck(): Promise<APIResponse<{ status: string }>> {
    return this.executeWithRetry(
      async () => {
        const response = await this.request('/user/tokens/verify', 'GET');
        return { status: response.success ? 'healthy' : 'unhealthy' };
      },
      'cloudflare:healthCheck'
    );
  }

  // ============================================
  // KV Storage Operations
  // ============================================

  /**
   * Get value from KV
   */
  async kvGet(key: string): Promise<APIResponse<CloudflareKVEntry | null>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/storage/kv/namespaces/${this.kvNamespaceId}/values/${encodeURIComponent(key)}`;
        const response = await this.request(endpoint, 'GET');

        if (!response.result) {
          return null;
        }

        return {
          key,
          value: response.result,
          metadata: response.result_info?.metadata,
        };
      },
      'cloudflare:kvGet'
    );
  }

  /**
   * Set value in KV
   */
  async kvSet(
    key: string,
    value: string,
    options?: { metadata?: Record<string, unknown>; expiration?: number }
  ): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/storage/kv/namespaces/${this.kvNamespaceId}/values/${encodeURIComponent(key)}`;

        const params = new URLSearchParams();
        if (options?.expiration) {
          params.append('expiration_ttl', options.expiration.toString());
        }

        await this.request(
          `${endpoint}?${params.toString()}`,
          'PUT',
          value,
          {
            'Content-Type': 'text/plain',
            ...(options?.metadata && {
              'CF-KV-Metadata': JSON.stringify(options.metadata),
            }),
          }
        );

        return true;
      },
      'cloudflare:kvSet'
    );
  }

  /**
   * Delete value from KV
   */
  async kvDelete(key: string): Promise<APIResponse<boolean>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/storage/kv/namespaces/${this.kvNamespaceId}/values/${encodeURIComponent(key)}`;
        await this.request(endpoint, 'DELETE');
        return true;
      },
      'cloudflare:kvDelete'
    );
  }

  /**
   * List KV keys
   */
  async kvList(prefix?: string, limit: number = 1000): Promise<APIResponse<string[]>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/storage/kv/namespaces/${this.kvNamespaceId}/keys`;
        const params = new URLSearchParams({ limit: limit.toString() });
        if (prefix) params.append('prefix', prefix);

        const response = await this.request(`${endpoint}?${params.toString()}`, 'GET');
        return response.result?.map((item: { name: string }) => item.name) ?? [];
      },
      'cloudflare:kvList'
    );
  }

  // ============================================
  // D1 Database Operations
  // ============================================

  /**
   * Execute D1 SQL query
   */
  async d1Query(sql: string, params?: unknown[]): Promise<APIResponse<CloudflareD1Result>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/d1/database/${this.d1DatabaseId}/query`;
        const response = await this.request(endpoint, 'POST', {
          sql,
          params: params ?? [],
        });

        return {
          success: response.success,
          results: response.result?.[0]?.results ?? [],
          meta: {
            duration: response.result?.[0]?.meta?.duration ?? 0,
            changes: response.result?.[0]?.meta?.changes ?? 0,
          },
        };
      },
      'cloudflare:d1Query'
    );
  }

  /**
   * Execute D1 batch queries
   */
  async d1Batch(
    queries: { sql: string; params?: unknown[] }[]
  ): Promise<APIResponse<CloudflareD1Result[]>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/d1/database/${this.d1DatabaseId}/query`;
        const response = await this.request(endpoint, 'POST', queries);

        return response.result?.map((r: CloudflareD1Result) => ({
          success: true,
          results: r.results ?? [],
          meta: r.meta ?? { duration: 0, changes: 0 },
        })) ?? [];
      },
      'cloudflare:d1Batch'
    );
  }

  // ============================================
  // Workers Operations
  // ============================================

  /**
   * List workers
   */
  async workersList(): Promise<APIResponse<CloudflareWorkerState[]>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/workers/scripts`;
        const response = await this.request(endpoint, 'GET');

        return response.result?.map((w: Record<string, unknown>) => ({
          id: w['id'] as string,
          name: w['id'] as string,
          deployed: true,
          routes: [],
          bindings: [],
        })) ?? [];
      },
      'cloudflare:workersList'
    );
  }

  /**
   * Deploy a worker script
   */
  async workerDeploy(
    name: string,
    script: string,
    bindings?: Record<string, unknown>
  ): Promise<APIResponse<CloudflareWorkerState>> {
    return this.executeWithRetry(
      async () => {
        const endpoint = `/accounts/${this.accountId}/workers/scripts/${name}`;

        const formData = new FormData();
        formData.append(
          'script',
          new Blob([script], { type: 'application/javascript' }),
          'index.js'
        );

        if (bindings) {
          formData.append(
            'metadata',
            new Blob([JSON.stringify({ bindings })], { type: 'application/json' })
          );
        }

        const response = await this.request(endpoint, 'PUT', formData, {
          'Content-Type': 'multipart/form-data',
        });

        return {
          id: response.result?.id ?? name,
          name,
          deployed: true,
          routes: [],
          bindings: [],
        };
      },
      'cloudflare:workerDeploy'
    );
  }

  // ============================================
  // State Sync Helpers
  // ============================================

  /**
   * Store state record in KV with hash
   */
  async storeState(
    key: string,
    state: Record<string, unknown>
  ): Promise<APIResponse<{ hash: string }>> {
    const hash = hashState(state);
    const payload = JSON.stringify({
      data: state,
      hash,
      updatedAt: new Date().toISOString(),
    });

    const result = await this.kvSet(key, payload, {
      metadata: { hash, version: Date.now() },
    });

    if (result.success) {
      return { ...result, data: { hash } };
    }

    return { ...result, data: undefined };
  }

  /**
   * Retrieve state record from KV and verify hash
   */
  async retrieveState(key: string): Promise<APIResponse<{
    state: Record<string, unknown>;
    hash: string;
    valid: boolean;
  } | null>> {
    const result = await this.kvGet(key);

    if (!result.success || !result.data) {
      return { ...result, data: null };
    }

    try {
      const parsed = JSON.parse(result.data.value);
      const currentHash = hashState(parsed.data);
      const valid = currentHash === parsed.hash;

      return {
        success: true,
        data: {
          state: parsed.data,
          hash: parsed.hash,
          valid,
        },
        metadata: result.metadata,
      };
    } catch {
      return {
        success: false,
        error: {
          code: 'PARSE_ERROR',
          message: 'Failed to parse state record',
          retryable: false,
        },
        metadata: result.metadata,
      };
    }
  }

  // ============================================
  // Internal Request Helper
  // ============================================

  private async request(
    endpoint: string,
    method: string,
    body?: unknown,
    additionalHeaders?: Record<string, string>
  ): Promise<{ success: boolean; result?: unknown; result_info?: Record<string, unknown> }> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      Authorization: `Bearer ${this.config.apiKey}`,
      ...additionalHeaders,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      if (body instanceof FormData) {
        delete headers['Content-Type'];
        options.body = body;
      } else if (typeof body === 'string') {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Cloudflare API error: ${response.status} - ${JSON.stringify(data)}`);
    }

    return data as { success: boolean; result?: unknown; result_info?: Record<string, unknown> };
  }
}

/**
 * Create and register Cloudflare client
 */
export function createCloudflareClient(config: CloudflareConfig): CloudflareClient {
  const client = new CloudflareClient(config);
  clientRegistry.register('cloudflare', client);
  return client;
}

export default CloudflareClient;
