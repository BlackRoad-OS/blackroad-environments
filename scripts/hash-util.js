#!/usr/bin/env node

/**
 * BlackRoad Environments - Hash Utility Script
 *
 * Command-line utility for hashing operations.
 *
 * Usage:
 *   node scripts/hash-util.js <command> [options]
 *
 * Commands:
 *   hash <data>           Hash the provided data
 *   verify <data> <hash>  Verify a hash against data
 *   file <path>           Hash a file
 *   state                 Hash current state
 */

const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const ALGORITHMS = ['sha256', 'sha384', 'sha512', 'sha_infinity'];
const DEFAULT_ALGORITHM = process.env.HASH_ALGORITHM || 'sha256';
const DEFAULT_ITERATIONS = parseInt(process.env.HASH_ITERATIONS || '100000', 10);
const SHA_INFINITY_ROUNDS = 7;

/**
 * Generate salt
 */
function generateSalt(length = 32) {
  return randomBytes(length).toString('hex');
}

/**
 * Basic hash functions
 */
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function sha384(data) {
  return createHash('sha384').update(data).digest('hex');
}

function sha512(data) {
  return createHash('sha512').update(data).digest('hex');
}

/**
 * SHA-Infinity implementation
 */
function shaInfinity(data, baseSalt = '', baseIterations = 10000) {
  let result = data;
  const salt = baseSalt || generateSalt(32);
  const algorithms = ['sha256', 'sha384', 'sha512'];

  for (let round = 0; round < SHA_INFINITY_ROUNDS; round++) {
    const algorithm = algorithms[round % algorithms.length];
    const roundSalt = createHash('sha256')
      .update(`${salt}:round:${round}:${result.substring(0, 16)}`)
      .digest('hex');

    const iterations = Math.floor(baseIterations * Math.pow(1.5, round));

    let roundResult = `${result}:${roundSalt}`;
    for (let i = 0; i < iterations; i++) {
      roundResult = createHash(algorithm).update(roundResult).digest('hex');
    }

    result = createHash(algorithm)
      .update(`${result}:${roundResult}`)
      .digest('hex');
  }

  return createHash('sha512').update(result).digest('hex');
}

/**
 * Hash with options
 */
function hash(data, options = {}) {
  const algorithm = options.algorithm || DEFAULT_ALGORITHM;
  const salt = options.salt || generateSalt(32);
  const iterations = options.iterations || DEFAULT_ITERATIONS;

  let result;

  if (algorithm === 'sha_infinity') {
    result = shaInfinity(data, salt, iterations);
  } else {
    result = `${data}:${salt}`;
    for (let i = 0; i < iterations; i++) {
      result = createHash(algorithm).update(result).digest('hex');
    }
  }

  return {
    hash: result,
    algorithm,
    iterations,
    salt,
    timestamp: Date.now(),
  };
}

/**
 * Verify hash
 */
function verify(data, hashResult) {
  const recomputed = hash(data, {
    algorithm: hashResult.algorithm,
    iterations: hashResult.iterations,
    salt: hashResult.salt,
  });

  const bufA = Buffer.from(recomputed.hash);
  const bufB = Buffer.from(hashResult.hash);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Hash file
 */
function hashFile(filePath, algorithm = 'sha256') {
  const content = fs.readFileSync(filePath);
  return {
    path: filePath,
    hash: createHash(algorithm).update(content).digest('hex'),
    algorithm,
    size: content.length,
    timestamp: Date.now(),
  };
}

/**
 * Hash directory recursively
 */
function hashDirectory(dirPath, algorithm = 'sha256') {
  const hashes = [];

  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!file.startsWith('.') && file !== 'node_modules') {
          walk(fullPath);
        }
      } else {
        hashes.push({
          path: fullPath,
          hash: hashFile(fullPath, algorithm).hash,
        });
      }
    }
  }

  walk(dirPath);

  const combined = hashes
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((h) => `${h.path}:${h.hash}`)
    .join('\n');

  return {
    directory: dirPath,
    fileCount: hashes.length,
    combinedHash: createHash(algorithm).update(combined).digest('hex'),
    files: hashes,
    algorithm,
    timestamp: Date.now(),
  };
}

/**
 * Print usage
 */
function printUsage() {
  console.log(`
BlackRoad Hash Utility

Usage:
  node scripts/hash-util.js <command> [options]

Commands:
  hash <data>                    Hash the provided data
  verify <data> <hash> <salt>    Verify a hash against data
  file <path>                    Hash a file
  dir <path>                     Hash a directory
  state                          Hash current state files

Options:
  --algorithm <algo>    Hash algorithm (${ALGORITHMS.join(', ')})
  --iterations <num>    Number of iterations (default: ${DEFAULT_ITERATIONS})
  --salt <salt>         Salt to use (auto-generated if not provided)
  --json                Output as JSON

Examples:
  node scripts/hash-util.js hash "hello world"
  node scripts/hash-util.js hash "secret" --algorithm sha_infinity
  node scripts/hash-util.js file package.json
  node scripts/hash-util.js dir src --json
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const result = {
    command: null,
    args: [],
    options: {
      algorithm: DEFAULT_ALGORITHM,
      iterations: DEFAULT_ITERATIONS,
      salt: null,
      json: false,
    },
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const option = arg.slice(2);
      if (option === 'json') {
        result.options.json = true;
      } else if (i + 1 < args.length) {
        const value = args[i + 1];
        if (option === 'algorithm') {
          result.options.algorithm = value;
        } else if (option === 'iterations') {
          result.options.iterations = parseInt(value, 10);
        } else if (option === 'salt') {
          result.options.salt = value;
        }
        i++;
      }
    } else if (!result.command) {
      result.command = arg;
    } else {
      result.args.push(arg);
    }
    i++;
  }

  return result;
}

/**
 * Main function
 */
function main() {
  const { command, args, options } = parseArgs(process.argv.slice(2));

  if (!command) {
    printUsage();
    process.exit(0);
  }

  let result;

  switch (command) {
    case 'hash': {
      const data = args[0];
      if (!data) {
        console.error('Error: No data provided');
        process.exit(1);
      }
      result = hash(data, options);
      break;
    }

    case 'verify': {
      const [data, hashValue, salt] = args;
      if (!data || !hashValue || !salt) {
        console.error('Error: verify requires <data> <hash> <salt>');
        process.exit(1);
      }
      const hashResult = {
        hash: hashValue,
        algorithm: options.algorithm,
        iterations: options.iterations,
        salt,
      };
      const valid = verify(data, hashResult);
      result = { valid, hashResult };
      break;
    }

    case 'file': {
      const filePath = args[0];
      if (!filePath) {
        console.error('Error: No file path provided');
        process.exit(1);
      }
      if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
      }
      result = hashFile(filePath, options.algorithm);
      break;
    }

    case 'dir': {
      const dirPath = args[0] || '.';
      if (!fs.existsSync(dirPath)) {
        console.error(`Error: Directory not found: ${dirPath}`);
        process.exit(1);
      }
      result = hashDirectory(dirPath, options.algorithm);
      // Don't include individual files in default output
      if (!options.json) {
        delete result.files;
      }
      break;
    }

    case 'state': {
      const stateFiles = ['package.json', 'tsconfig.json', '.env.example'];
      const hashes = stateFiles
        .filter((f) => fs.existsSync(f))
        .map((f) => hashFile(f, options.algorithm));

      const combined = hashes.map((h) => `${h.path}:${h.hash}`).join('\n');
      result = {
        files: hashes,
        combinedHash: sha256(combined),
        timestamp: Date.now(),
      };
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }

  // Output result
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n📊 Hash Result:');
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        console.log(`  ${key}:`);
        for (const [k, v] of Object.entries(value)) {
          console.log(`    ${k}: ${v}`);
        }
      } else if (Array.isArray(value)) {
        console.log(`  ${key}: [${value.length} items]`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    }
    console.log('');
  }
}

main();
