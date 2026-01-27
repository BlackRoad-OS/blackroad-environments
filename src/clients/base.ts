/**
 * BlackRoad Environments - Base API Client
 *
 * Abstract base class for all API integrations with unified error handling,
 * retry logic, and response processing.
 */

import { createHash } from 'crypto';
import type { APIClientConfig, APIResponse, APIError, ResponseMetadata, RetryPolicy } from '../types/index.js';

export abstract class BaseAPIClient {
  protected readonly config: Required<APIClientConfig>;
  protected readonly retryPolicy: RetryPolicy;

  constructor(config: APIClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? '',
      apiKey: config.apiKey ?? '',
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      headers: config.headers ?? {},
    };

    this.retryPolicy = {
      maxRetries: this.config.retries,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBase: 2,
    };
  }

  /**
   * Abstract method to be implemented by each client
   */
  abstract healthCheck(): Promise<APIResponse<{ status: string }>>;

  /**
   * Execute a request with automatic retry logic
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<APIResponse<T>> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryPolicy.maxRetries; attempt++) {
      try {
        const data = await operation();
        const duration = Date.now() - startTime;

        return {
          success: true,
          data,
          metadata: this.createMetadata(requestId, duration, data),
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const apiError = this.parseError(lastError);

        if (!apiError.retryable || attempt === this.retryPolicy.maxRetries) {
          return {
            success: false,
            error: apiError,
            metadata: this.createMetadata(requestId, Date.now() - startTime),
          };
        }

        const delay = this.calculateBackoff(attempt);
        console.warn(`[${context}] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    return {
      success: false,
      error: this.parseError(lastError ?? new Error('Unknown error')),
      metadata: this.createMetadata(requestId, Date.now() - startTime),
    };
  }

  /**
   * Parse errors into standardized format
   */
  protected parseError(error: Error): APIError {
    const message = error.message;

    // Determine if error is retryable based on common patterns
    const retryable = this.isRetryableError(error);

    // Extract error code if available
    const code = this.extractErrorCode(error);

    return {
      code,
      message,
      retryable,
      details: {
        name: error.name,
        stack: error.stack,
      },
    };
  }

  /**
   * Check if error is retryable
   */
  protected isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const retryablePatterns = [
      'timeout',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'network',
      '429',
      '502',
      '503',
      '504',
      'rate limit',
      'throttl',
    ];

    return retryablePatterns.some(pattern => message.includes(pattern));
  }

  /**
   * Extract error code from error
   */
  protected extractErrorCode(error: Error): string {
    // Check for HTTP status code patterns
    const statusMatch = error.message.match(/(\d{3})/);
    if (statusMatch) {
      return `HTTP_${statusMatch[1]}`;
    }

    // Check for common error codes
    if (error.message.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (error.message.includes('ETIMEDOUT')) return 'TIMEOUT';
    if (error.message.includes('ENOTFOUND')) return 'DNS_NOT_FOUND';

    return 'UNKNOWN_ERROR';
  }

  /**
   * Calculate exponential backoff delay
   */
  protected calculateBackoff(attempt: number): number {
    const delay = this.retryPolicy.baseDelayMs *
      Math.pow(this.retryPolicy.exponentialBase, attempt);

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;

    return Math.min(delay + jitter, this.retryPolicy.maxDelayMs);
  }

  /**
   * Generate unique request ID
   */
  protected generateRequestId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `br_${timestamp}_${random}`;
  }

  /**
   * Create response metadata
   */
  protected createMetadata(
    requestId: string,
    duration: number,
    data?: unknown
  ): ResponseMetadata {
    return {
      requestId,
      timestamp: Date.now(),
      duration,
      hash: data ? this.hashData(data) : undefined,
    };
  }

  /**
   * Hash response data for integrity verification
   */
  protected hashData(data: unknown): string {
    const serialized = JSON.stringify(data, Object.keys(data as object).sort());
    return createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Sleep helper
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get default headers for requests
   */
  protected getDefaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'BlackRoad-Environments/1.0.0',
      ...this.config.headers,
    };
  }

  /**
   * Validate configuration
   */
  protected validateConfig(required: string[]): void {
    const missing = required.filter(key => !this.config[key as keyof APIClientConfig]);
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
  }
}

/**
 * Client registry for managing multiple API clients
 */
export class ClientRegistry {
  private clients: Map<string, BaseAPIClient> = new Map();

  register(name: string, client: BaseAPIClient): void {
    this.clients.set(name, client);
  }

  get<T extends BaseAPIClient>(name: string): T | undefined {
    return this.clients.get(name) as T | undefined;
  }

  async healthCheckAll(): Promise<Map<string, APIResponse<{ status: string }>>> {
    const results = new Map<string, APIResponse<{ status: string }>>();

    await Promise.all(
      Array.from(this.clients.entries()).map(async ([name, client]) => {
        results.set(name, await client.healthCheck());
      })
    );

    return results;
  }

  list(): string[] {
    return Array.from(this.clients.keys());
  }
}

export const clientRegistry = new ClientRegistry();
