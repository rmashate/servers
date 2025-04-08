/**
 * LRU Cache Implementation for Memory MCP
 * 
 * This implementation uses the LRU (Least Recently Used) caching strategy
 * to improve performance for frequently accessed data.
 */

import { LRUCache as LRU } from 'lru-cache';
import { Entity, Relation, KnowledgeGraph, SearchParams } from '../models/knowledge-graph';
import { Cache, KnowledgeGraphCache, CacheOptions } from './index';

/**
 * LRU Cache implementation
 */
export class LRUCache implements Cache {
  private cache: LRU<string, any>;

  /**
   * Create a new LRU cache
   * @param options Cache options
   */
  constructor(options?: CacheOptions) {
    this.cache = new LRU({
      max: options?.maxSize || 1000,
      ttl: options?.ttl || 5 * 60 * 1000, // 5 minutes default TTL
    });
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or undefined if not found
   */
  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time-to-live in milliseconds (optional)
   */
  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, ttl ? { ttl } : undefined);
  }

  /**
   * Delete a value from the cache
   * @param key Cache key
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Knowledge Graph Cache implementation using LRU strategy
 */
export class KnowledgeGraphLRUCache implements KnowledgeGraphCache {
  private cache: Cache;
  private readonly GRAPH_KEY = 'complete_graph';
  private readonly SEARCH_PREFIX = 'search:';
  private readonly ENTITY_TYPE_PREFIX = 'entity_type:';
  private readonly OBSERVATION_PREFIX = 'observation:';
  private readonly ADVANCED_SEARCH_PREFIX = 'advanced_search:';
  private readonly NODE_PREFIX = 'nodes:';
  private readonly RELATION_PREFIX = 'relation:';

  /**
   * Create a new knowledge graph cache
   * @param cache Underlying cache implementation
   */
  constructor(cache: Cache) {
    this.cache = cache;
  }

  /**
   * Get the complete knowledge graph from cache
   * @returns Cached knowledge graph or undefined if not found
   */
  getGraph(): KnowledgeGraph | undefined {
    return this.cache.get<KnowledgeGraph>(this.GRAPH_KEY);
  }

  /**
   * Cache the complete knowledge graph
   * @param graph Knowledge graph to cache
   */
  setGraph(graph: KnowledgeGraph): void {
    this.cache.set(this.GRAPH_KEY, graph);
  }

  /**
   * Get search results from cache
   * @param query Search query
   * @returns Cached search results or undefined if not found
   */
  getSearchResults(query: string): KnowledgeGraph | undefined {
    return this.cache.get<KnowledgeGraph>(`${this.SEARCH_PREFIX}${query.toLowerCase()}`);
  }

  /**
   * Cache search results
   * @param query Search query
   * @param results Search results to cache
   */
  setSearchResults(query: string, results: KnowledgeGraph): void {
    this.cache.set(`${this.SEARCH_PREFIX}${query.toLowerCase()}`, results);
  }

  /**
   * Get entity search results from cache
   * @param entityType Entity type to search for
   * @returns Cached search results or undefined if not found
   */
  getEntityTypeResults(entityType: string): KnowledgeGraph | undefined {
    return this.cache.get<KnowledgeGraph>(`${this.ENTITY_TYPE_PREFIX}${entityType.toLowerCase()}`);
  }

  /**
   * Cache entity search results
   * @param entityType Entity type to search for
   * @param results Search results to cache
   */
  setEntityTypeResults(entityType: string, results: KnowledgeGraph): void {
    this.cache.set(`${this.ENTITY_TYPE_PREFIX}${entityType.toLowerCase()}`, results);
  }

  /**
   * Get observation search results from cache
   * @param observation Observation content to search for
   * @returns Cached search results or undefined if not found
   */
  getObservationResults(observation: string): KnowledgeGraph | undefined {
    return this.cache.get<KnowledgeGraph>(`${this.OBSERVATION_PREFIX}${observation.toLowerCase()}`);
  }

  /**
   * Cache observation search results
   * @param observation Observation content to search for
   * @param results Search results to cache
   */
  setObservationResults(observation: string, results: KnowledgeGraph): void {
    this.cache.set(`${this.OBSERVATION_PREFIX}${observation.toLowerCase()}`, results);
  }

  /**
   * Get advanced search results from cache
   * @param params Search parameters
   * @returns Cached search results or undefined if not found
   */
  getAdvancedSearchResults(params: SearchParams): KnowledgeGraph | undefined {
    // Create a cache key based on the search parameters
    const key = `${this.ADVANCED_SEARCH_PREFIX}${this.createAdvancedSearchKey(params)}`;
    return this.cache.get<KnowledgeGraph>(key);
  }

  /**
   * Cache advanced search results
   * @param params Search parameters
   * @param results Search results to cache
   */
  setAdvancedSearchResults(params: SearchParams, results: KnowledgeGraph): void {
    // Create a cache key based on the search parameters
    const key = `${this.ADVANCED_SEARCH_PREFIX}${this.createAdvancedSearchKey(params)}`;
    this.cache.set(key, results);
  }

  /**
   * Create a cache key for advanced search parameters
   * @param params Search parameters
   * @returns Cache key
   */
  private createAdvancedSearchKey(params: SearchParams): string {
    return `${params.query.toLowerCase()}|${params.entityType || ''}|${params.limitEntities || ''}|${params.limitRelations || ''}`;
  }

  /**
   * Get node results from cache
   * @param names Node names
   * @returns Cached node results or undefined if not found
   */
  getNodeResults(names: string[]): KnowledgeGraph | undefined {
    // Sort names to ensure consistent cache keys
    const sortedNames = [...names].sort().join(',');
    return this.cache.get<KnowledgeGraph>(`${this.NODE_PREFIX}${sortedNames}`);
  }

  /**
   * Cache node results
   * @param names Node names
   * @param results Node results to cache
   */
  setNodeResults(names: string[], results: KnowledgeGraph): void {
    // Sort names to ensure consistent cache keys
    const sortedNames = [...names].sort().join(',');
    this.cache.set(`${this.NODE_PREFIX}${sortedNames}`, results);
  }

  /**
   * Get relation results from cache
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Cached relation results or undefined if not found
   */
  getRelationResults(fromEntity: string, toEntity: string): Relation[] | undefined {
    return this.cache.get<Relation[]>(`${this.RELATION_PREFIX}${fromEntity}|${toEntity}`);
  }

  /**
   * Cache relation results
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @param results Relation results to cache
   */
  setRelationResults(fromEntity: string, toEntity: string, results: Relation[]): void {
    this.cache.set(`${this.RELATION_PREFIX}${fromEntity}|${toEntity}`, results);
  }

  /**
   * Invalidate the cache for a specific entity
   * @param entityName Entity name
   */
  invalidateEntity(entityName: string): void {
    // Clear the complete graph cache
    this.cache.delete(this.GRAPH_KEY);
    
    // Clear any search or node caches that might include this entity
    // This is a simplistic approach - a more sophisticated implementation
    // would only invalidate relevant cache entries
    
    // For now, we clear all search and node caches
    this.invalidatePrefix(this.SEARCH_PREFIX);
    this.invalidatePrefix(this.ENTITY_TYPE_PREFIX);
    this.invalidatePrefix(this.OBSERVATION_PREFIX);
    this.invalidatePrefix(this.ADVANCED_SEARCH_PREFIX);
    this.invalidatePrefix(this.NODE_PREFIX);
    
    // Clear any relation caches that include this entity
    this.invalidatePrefix(this.RELATION_PREFIX);
  }

  /**
   * Invalidate all cache entries with a specific prefix
   * @param prefix Cache key prefix
   */
  private invalidatePrefix(prefix: string): void {
    // This is a simplistic approach - in a real implementation,
    // we would keep track of cache keys with prefixes
    
    // For now, we clear the entire cache
    this.invalidate();
  }

  /**
   * Invalidate the entire cache
   */
  invalidate(): void {
    this.cache.clear();
  }
}

/**
 * Create a new knowledge graph cache
 * @param options Cache options
 * @returns Knowledge graph cache
 */
export function createKnowledgeGraphCache(options?: CacheOptions): KnowledgeGraphCache {
  const cache = new LRUCache(options);
  return new KnowledgeGraphLRUCache(cache);
}
