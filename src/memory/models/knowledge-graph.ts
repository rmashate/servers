/**
 * Knowledge Graph Data Models
 * 
 * This file defines the core data structures used by the Memory MCP server.
 */

/**
 * Represents an entity in the knowledge graph
 */
export interface Entity {
  name: string;
  entityType: string;
  observations: string[];
  
  // Additional metadata
  created_at?: string;
  updated_at?: string;
}

/**
 * Represents a relation between two entities in the knowledge graph
 */
export interface Relation {
  from: string;
  to: string;
  relationType: string;
  
  // Additional metadata
  created_at?: string;
  updated_at?: string;
}

/**
 * Represents the complete knowledge graph
 */
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
}

/**
 * Parameters for creating an entity
 */
export interface CreateEntityParams {
  name: string;
  entityType: string;
  observations: string[];
}

/**
 * Parameters for creating a relation
 */
export interface CreateRelationParams {
  from: string;
  to: string;
  relationType: string;
}

/**
 * Parameters for adding observations to an entity
 */
export interface AddObservationsParams {
  entityName: string;
  contents: string[];
}

/**
 * Result of adding observations to an entity
 */
export interface AddObservationsResult {
  entityName: string;
  addedObservations: string[];
}

/**
 * Parameters for deleting observations from an entity
 */
export interface DeleteObservationsParams {
  entityName: string;
  observations: string[];
}

/**
 * Search parameters
 */
export interface SearchParams {
  query: string;
  entityType?: string;
  limitEntities?: number;
  limitRelations?: number;
}

/**
 * Parameters for retrieving entities by name
 */
export interface GetByNamesParams {
  names: string[];
  includeRelations?: boolean;
}
