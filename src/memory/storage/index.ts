/**
 * Storage Abstraction for Memory MCP
 * 
 * This file defines the interfaces for storage implementations used by the Memory MCP server.
 */

import { 
  Entity, 
  Relation, 
  KnowledgeGraph, 
  AddObservationsParams, 
  AddObservationsResult,
  DeleteObservationsParams,
  SearchParams,
  GetByNamesParams 
} from '../models/knowledge-graph';

/**
 * Storage interface defining operations for interacting with the knowledge graph
 */
export interface Storage {
  /**
   * Create new entities in the knowledge graph
   * @param entities Array of entities to create
   * @returns Array of created entities (excludes any that already existed)
   */
  createEntities(entities: Entity[]): Promise<Entity[]>;
  
  /**
   * Create new relations between entities in the knowledge graph
   * @param relations Array of relations to create
   * @returns Array of created relations (excludes any that already existed)
   */
  createRelations(relations: Relation[]): Promise<Relation[]>;
  
  /**
   * Add observations to existing entities
   * @param observations Array of objects containing entity name and observations to add
   * @returns Array of objects containing entity name and added observations
   */
  addObservations(observations: AddObservationsParams[]): Promise<AddObservationsResult[]>;
  
  /**
   * Delete entities from the knowledge graph
   * @param entityNames Array of entity names to delete
   */
  deleteEntities(entityNames: string[]): Promise<void>;
  
  /**
   * Delete specific observations from entities
   * @param deletions Array of objects containing entity name and observations to delete
   */
  deleteObservations(deletions: DeleteObservationsParams[]): Promise<void>;
  
  /**
   * Delete relations from the knowledge graph
   * @param relations Array of relations to delete
   */
  deleteRelations(relations: Relation[]): Promise<void>;
  
  /**
   * Read the entire knowledge graph
   * @returns Complete knowledge graph with all entities and relations
   */
  readGraph(): Promise<KnowledgeGraph>;
  
  /**
   * Search for nodes in the knowledge graph
   * @param query Search query string
   * @returns Knowledge graph containing matching entities and their relations
   */
  searchNodes(query: string): Promise<KnowledgeGraph>;
  
  /**
   * Retrieve specific nodes by name
   * @param names Array of entity names to retrieve
   * @returns Knowledge graph containing requested entities and their relations
   */
  openNodes(names: string[]): Promise<KnowledgeGraph>;
  
  /**
   * Search for entities by entity type
   * @param entityType Entity type to search for
   * @returns Knowledge graph containing matching entities and their relations
   */
  searchByEntityType(entityType: string): Promise<KnowledgeGraph>;
  
  /**
   * Search for entities by observation content
   * @param observation Observation content to search for
   * @returns Knowledge graph containing matching entities and their relations
   */
  searchByObservation(observation: string): Promise<KnowledgeGraph>;
  
  /**
   * Get relations between two entities
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Array of relations between the entities
   */
  getRelationsBetween(fromEntity: string, toEntity: string): Promise<Relation[]>;
  
  /**
   * Advanced search with multiple parameters
   * @param params Search parameters
   * @returns Knowledge graph containing matching entities and their relations
   */
  advancedSearch(params: SearchParams): Promise<KnowledgeGraph>;
  
  /**
   * Initialize the storage (create tables, etc.)
   */
  initialize(): Promise<void>;
  
  /**
   * Perform maintenance tasks (vacuum, optimize, etc.)
   */
  maintenance(): Promise<void>;
}

/**
 * StorageFactory interface for creating storage instances
 */
export interface StorageFactory {
  /**
   * Create a new storage instance
   */
  createStorage(): Promise<Storage>;
}

/**
 * Storage options for configuring storage implementations
 */
export interface StorageOptions {
  /**
   * Path to the file storage
   */
  filePath?: string;
  
  /**
   * Path to the database storage
   */
  dbPath?: string;
  
  /**
   * Storage type to use
   */
  storageType?: 'file' | 'db' | 'combined';
}
