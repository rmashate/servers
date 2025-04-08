/**
 * Cache Abstraction for Memory MCP
 * 
 * This file defines the interfaces for cache implementations used by the Memory MCP server.
 */

import { Entity, Relation, KnowledgeGraph, SearchParams } from '../models/knowledge-graph';

/**
 * Generic cache interface
 */
export interface Cache {
  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or undefined if not found
   */
  get<T>(key: string): T | undefined;

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time-to-live in milliseconds (optional)
   */
  set<T>(key: string, value: T, ttl?: number): void;

  /**
   * Delete a value from the cache
   * @param key Cache key
   */
  delete(key: string): void;

  /**
   * Clear the entire cache
   */
  clear(): void;
}

/**
 * Knowledge graph cache interface
 */
export interface KnowledgeGraphCache {
  /**
   * Get the complete knowledge graph from cache
   * @returns Cached knowledge graph or undefined if not found
   */
  getGraph(): KnowledgeGraph | undefined;

  /**
   * Cache the complete knowledge graph
   * @param graph Knowledge graph to cache
   */
  setGraph(graph: KnowledgeGraph): void;

  /**
   * Get search results from cache
   * @param query Search query
   * @returns Cached search results or undefined if not found
   */
  getSearchResults(query: string): KnowledgeGraph | undefined;

  /**
   * Cache search results
   * @param query Search query
   * @param results Search results to cache
   */
  setSearchResults(query: string, results: KnowledgeGraph): void;

  /**
   * Get entity search results from cache
   * @param entityType Entity type to search for
   * @returns Cached search results or undefined if not found
   */
  getEntityTypeResults(entityType: string): KnowledgeGraph | undefined;

  /**
   * Cache entity search results
   * @param entityType Entity type to search for
   * @param results Search results to cache
   */
  setEntityTypeResults(entityType: string, results: KnowledgeGraph): void;

  /**
   * Get observation search results from cache
   * @param observation Observation content to search for
   * @returns Cached search results or undefined if not found
   */
  getObservationResults(observation: string): KnowledgeGraph | undefined;

  /**
   * Cache observation search results
   * @param observation Observation content to search for
   * @param results Search results to cache
   */
  setObservationResults(observation: string, results: KnowledgeGraph): void;

  /**
   * Get advanced search results from cache
   * @param params Search parameters
   * @returns Cached search results or undefined if not found
   */
  getAdvancedSearchResults(params: SearchParams): KnowledgeGraph | undefined;

  /**
   * Cache advanced search results
   * @param params Search parameters
   * @param results Search results to cache
   */
  setAdvancedSearchResults(params: SearchParams, results: KnowledgeGraph): void;

  /**
   * Get node results from cache
   * @param names Node names
   * @returns Cached node results or undefined if not found
   */
  getNodeResults(names: string[]): KnowledgeGraph | undefined;

  /**
   * Cache node results
   * @param names Node names
   * @param results Node results to cache
   */
  setNodeResults(names: string[], results: KnowledgeGraph): void;

  /**
   * Get relation results from cache
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Cached relation results or undefined if not found
   */
  getRelationResults(fromEntity: string, toEntity: string): Relation[] | undefined;

  /**
   * Cache relation results
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @param results Relation results to cache
   */
  setRelationResults(fromEntity: string, toEntity: string, results: Relation[]): void;

  /**
   * Invalidate the cache for a specific entity
   * @param entityName Entity name
   */
  invalidateEntity(entityName: string): void;

  /**
   * Invalidate the entire cache
   */
  invalidate(): void;
}

/**
 * Cache options for configuring cache implementations
 */
export interface CacheOptions {
  /**
   * Maximum number of items in the cache
   */
  maxSize?: number;

  /**
   * Default time-to-live in milliseconds
   */
  ttl?: number;
}
