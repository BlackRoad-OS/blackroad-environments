/**
 * BlackRoad Environments - Hashing Utilities
 *
 * SHA-256, SHA-384, SHA-512, and SHA-Infinity hashing with
 * salt, iterations, and integrity verification.
 *
 * SHA-Infinity: A recursive hashing approach that applies multiple
 * rounds of hashing with progressive salt modification for enhanced
 * entropy distribution and collision resistance.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { HashOptions, HashResult, HashVerification } from '../types/index.js';

// Default configuration
const DEFAULT_OPTIONS: Required<HashOptions> = {
  algorithm: 'sha256',
  iterations: 100000,
  salt: '',
  encoding: 'hex',
};

// SHA-Infinity configuration
const SHA_INFINITY_ROUNDS = 7;
const SHA_INFINITY_ALGORITHMS = ['sha256', 'sha384', 'sha512'] as const;

/**
 * Generate a cryptographically secure salt
 */
export function generateSalt(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Hash data using SHA-256
 */
export function sha256(data: string, encoding: 'hex' | 'base64' | 'base64url' = 'hex'): string {
  return createHash('sha256').update(data).digest(encoding);
}

/**
 * Hash data using SHA-384
 */
export function sha384(data: string, encoding: 'hex' | 'base64' | 'base64url' = 'hex'): string {
  return createHash('sha384').update(data).digest(encoding);
}

/**
 * Hash data using SHA-512
 */
export function sha512(data: string, encoding: 'hex' | 'base64' | 'base64url' = 'hex'): string {
  return createHash('sha512').update(data).digest(encoding);
}

/**
 * SHA-Infinity: Multi-round recursive hashing
 *
 * Applies multiple rounds of different SHA algorithms with
 * progressive salt modification for maximum entropy.
 *
 * Each round:
 * 1. Selects algorithm based on round number
 * 2. Modifies salt with round-specific entropy
 * 3. Applies hash with iteration count scaled by round
 * 4. Combines result with previous round's output
 *
 * @param data - Data to hash
 * @param baseSalt - Base salt value
 * @param baseIterations - Base iteration count (multiplied per round)
 * @param encoding - Output encoding
 */
export function shaInfinity(
  data: string,
  baseSalt: string = '',
  baseIterations: number = 10000,
  encoding: 'hex' | 'base64' | 'base64url' = 'hex'
): string {
  let result = data;
  const salt = baseSalt || generateSalt(32);

  for (let round = 0; round < SHA_INFINITY_ROUNDS; round++) {
    // Select algorithm for this round
    const algorithm = SHA_INFINITY_ALGORITHMS[round % SHA_INFINITY_ALGORITHMS.length];

    // Create round-specific salt
    const roundSalt = createHash('sha256')
      .update(`${salt}:round:${round}:${result.substring(0, 16)}`)
      .digest('hex');

    // Calculate iterations for this round (increases each round)
    const iterations = Math.floor(baseIterations * Math.pow(1.5, round));

    // Apply iterative hashing for this round
    let roundResult = `${result}:${roundSalt}`;
    for (let i = 0; i < iterations; i++) {
      roundResult = createHash(algorithm)
        .update(roundResult)
        .digest('hex');
    }

    // Combine with previous result using XOR-like mixing
    result = mixHashes(result, roundResult, algorithm);
  }

  // Final encoding pass
  const finalHash = createHash('sha512')
    .update(result)
    .digest(encoding);

  return finalHash;
}

/**
 * Mix two hash values for combined entropy
 */
function mixHashes(hash1: string, hash2: string, algorithm: string): string {
  const combined = `${hash1}:${hash2}`;
  return createHash(algorithm as 'sha256' | 'sha384' | 'sha512')
    .update(combined)
    .digest('hex');
}

/**
 * Hash with configurable options
 */
export function hash(data: string, options: Partial<HashOptions> = {}): HashResult {
  const opts: Required<HashOptions> = { ...DEFAULT_OPTIONS, ...options };
  const salt = opts.salt || generateSalt(32);
  const timestamp = Date.now();

  let result: string;

  if (opts.algorithm === 'sha_infinity') {
    result = shaInfinity(data, salt, opts.iterations, opts.encoding);
  } else {
    // Standard iterative hashing
    result = `${data}:${salt}`;
    for (let i = 0; i < (opts.iterations ?? 1); i++) {
      result = createHash(opts.algorithm)
        .update(result)
        .digest('hex');
    }

    // Apply final encoding if different from hex
    if (opts.encoding !== 'hex') {
      const buffer = Buffer.from(result, 'hex');
      result = buffer.toString(opts.encoding);
    }
  }

  return {
    hash: result,
    algorithm: opts.algorithm,
    iterations: opts.iterations ?? 1,
    salt,
    timestamp,
  };
}

/**
 * Verify a hash against input data
 */
export function verify(
  data: string,
  hashResult: HashResult
): HashVerification {
  const recomputed = hash(data, {
    algorithm: hashResult.algorithm as HashOptions['algorithm'],
    iterations: hashResult.iterations,
    salt: hashResult.salt,
    encoding: 'hex',
  });

  // Use timing-safe comparison
  const valid = timingSafeCompare(recomputed.hash, hashResult.hash);

  return {
    valid,
    hash: hashResult,
    input: data,
  };
}

/**
 * Timing-safe string comparison
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  return timingSafeEqual(bufA, bufB);
}

/**
 * Generate content-addressable hash for state records
 */
export function hashState(state: Record<string, unknown>): string {
  // Sort keys for consistent hashing
  const sorted = JSON.stringify(state, Object.keys(state).sort());
  return sha256(sorted);
}

/**
 * Generate a hash chain (blockchain-like)
 */
export function createHashChain(
  items: string[],
  previousHash: string = '0'.repeat(64)
): { chain: string[]; finalHash: string } {
  const chain: string[] = [];
  let currentHash = previousHash;

  for (const item of items) {
    const blockData = `${currentHash}:${item}`;
    currentHash = sha256(blockData);
    chain.push(currentHash);
  }

  return {
    chain,
    finalHash: currentHash,
  };
}

/**
 * HMAC-based hash for authentication
 */
export function hmacHash(
  data: string,
  key: string,
  algorithm: 'sha256' | 'sha384' | 'sha512' = 'sha256'
): string {
  const { createHmac } = require('crypto');
  return createHmac(algorithm, key).update(data).digest('hex');
}

/**
 * Generate a unique hash-based ID
 */
export function hashId(prefix: string = 'br'): string {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(8).toString('hex');
  const hash = sha256(`${timestamp}:${random}`).substring(0, 12);
  return `${prefix}_${hash}`;
}

/**
 * Hash file content for integrity checking
 */
export async function hashFileContent(content: string | Buffer): Promise<string> {
  const data = typeof content === 'string' ? content : content.toString('utf-8');
  return sha256(data);
}

/**
 * Create a merkle root from an array of hashes
 */
export function merkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return sha256('empty');
  }

  if (hashes.length === 1) {
    return hashes[0] as string;
  }

  const nextLevel: string[] = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const left = hashes[i];
    const right = hashes[i + 1] ?? left; // Duplicate last hash if odd
    nextLevel.push(sha256(`${left}:${right}`));
  }

  return merkleRoot(nextLevel);
}

// Export default hash function
export default hash;
