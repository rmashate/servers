/**
 * Storage Factory for Memory MCP
 * 
 * This module provides factory functions for creating storage implementations
 * based on configuration options.
 */

import { Storage, StorageOptions } from './index';
import { FileStorage } from './file-storage';
import { DbStorage } from './db-storage';
import { CombinedStorage } from './combined-storage';
import path from 'path';
import fs from 'fs';

/**
 * Create a storage implementation based on options
 * @param options Storage options
 * @returns Storage implementation
 */
export async function createStorage(options?: StorageOptions): Promise<Storage> {
  // Get file path from options or environment
  const filePath = options?.filePath || process.env.MEMORY_FILE_PATH || 'memory.json';
  
  // Get database path from options or environment
  const dbPath = options?.dbPath || process.env.DB_PATH || 'memory.db';
  
  // Get storage type from options or environment
  const storageType = options?.storageType || process.env.STORAGE_TYPE || 'combined';
  
  // Create the appropriate storage implementation
  switch (storageType) {
    case 'file':
      return createFileStorage(filePath);
    case 'db':
      return createDbStorage(dbPath);
    case 'combined':
    default:
      return createCombinedStorage(filePath, dbPath);
  }
}

/**
 * Create a file storage implementation
 * @param filePath Path to the memory file
 * @returns File storage implementation
 */
export async function createFileStorage(filePath: string): Promise<Storage> {
  // Resolve file path
  const resolvedPath = path.isAbsolute(filePath) 
    ? filePath 
    : path.resolve(process.cwd(), filePath);
  
  // Create storage
  const storage = new FileStorage(resolvedPath);
  
  // Initialize storage
  await storage.initialize();
  
  return storage;
}

/**
 * Create a database storage implementation
 * @param dbPath Path to the database file
 * @returns Database storage implementation
 */
export async function createDbStorage(dbPath: string): Promise<Storage> {
  // Resolve database path
  const resolvedPath = path.isAbsolute(dbPath) 
    ? dbPath 
    : path.resolve(process.cwd(), dbPath);
  
  // Ensure directory exists
  const directory = path.dirname(resolvedPath);
  await fs.promises.mkdir(directory, { recursive: true });
  
  // Create storage
  const storage = new DbStorage(resolvedPath);
  
  // Initialize storage
  await storage.initialize();
  
  return storage;
}

/**
 * Create a combined storage implementation
 * @param filePath Path to the memory file
 * @param dbPath Path to the database file
 * @returns Combined storage implementation
 */
export async function createCombinedStorage(filePath: string, dbPath: string): Promise<Storage> {
  // Create file storage
  const fileStorage = await createFileStorage(filePath);
  
  // Create database storage
  const dbStorage = await createDbStorage(dbPath);
  
  // Create combined storage
  const storage = new CombinedStorage(fileStorage, dbStorage);
  
  // Initialize storage
  await storage.initialize();
  
  return storage;
}
