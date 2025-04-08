/**
 * Combined Storage Implementation for Memory MCP
 * 
 * This implementation combines file and database storage to provide
 * backward compatibility while gaining the performance benefits of
 * database storage. It synchronizes changes between the two storage
 * backends to ensure consistency.
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
import { Storage } from './index';

/**
 * Combined storage implementation
 */
export class CombinedStorage implements Storage {
  private fileStorage: Storage;
  private dbStorage: Storage;
  private preferDb: boolean = true;

  /**
   * Create a new combined storage instance
   * @param fileStorage File storage implementation
   * @param dbStorage Database storage implementation
   * @param preferDb Whether to prefer database storage for read operations (default: true)
   */
  constructor(fileStorage: Storage, dbStorage: Storage, preferDb: boolean = true) {
    this.fileStorage = fileStorage;
    this.dbStorage = dbStorage;
    this.preferDb = preferDb;
  }

  /**
   * Initialize both storage backends
   */
  async initialize(): Promise<void> {
    await Promise.all([
      this.fileStorage.initialize(),
      this.dbStorage.initialize()
    ]);
    
    // Import existing data from file storage to database
    await this.syncFromFileToDb();
  }

  /**
   * Perform maintenance on both storage backends
   */
  async maintenance(): Promise<void> {
    await Promise.all([
      this.fileStorage.maintenance(),
      this.dbStorage.maintenance()
    ]);
  }

  /**
   * Synchronize data from file storage to database storage
   */
  private async syncFromFileToDb(): Promise<void> {
    // Get all data from file storage
    const fileGraph = await this.fileStorage.readGraph();
    
    // Get all data from database storage
    const dbGraph = await this.dbStorage.readGraph();
    
    // Create a set of existing entity names in the database
    const existingEntities = new Set(dbGraph.entities.map(e => e.name));
    
    // Filter out entities that already exist in the database
    const newEntities = fileGraph.entities.filter(e => !existingEntities.has(e.name));
    
    // Create new entities in the database
    if (newEntities.length > 0) {
      await this.dbStorage.createEntities(newEntities);
    }
    
    // Create a set of existing relations in the database
    const existingRelations = new Set(dbGraph.relations.map(r => 
      `${r.from}|${r.to}|${r.relationType}`
    ));
    
    // Filter out relations that already exist in the database
    const newRelations = fileGraph.relations.filter(r => 
      !existingRelations.has(`${r.from}|${r.to}|${r.relationType}`)
    );
    
    // Create new relations in the database
    if (newRelations.length > 0) {
      await this.dbStorage.createRelations(newRelations);
    }
  }

  /**
   * Create new entities in the knowledge graph
   * @param entities Entities to create
   * @returns Created entities
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    // Create entities in the file storage first
    const fileResult = await this.fileStorage.createEntities(entities);
    
    // Then create them in the database
    const dbResult = await this.dbStorage.createEntities(entities);
    
    // Return the database result (should be the same as file result)
    return dbResult;
  }

  /**
   * Create new relations in the knowledge graph
   * @param relations Relations to create
   * @returns Created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    // Create relations in the file storage first
    const fileResult = await this.fileStorage.createRelations(relations);
    
    // Then create them in the database
    const dbResult = await this.dbStorage.createRelations(relations);
    
    // Return the database result (should be the same as file result)
    return dbResult;
  }

  /**
   * Add observations to entities
   * @param observations Observations to add
   * @returns Added observations
   */
  async addObservations(observations: AddObservationsParams[]): Promise<AddObservationsResult[]> {
    // Add observations to the file storage first
    const fileResult = await this.fileStorage.addObservations(observations);
    
    // Then add them to the database
    const dbResult = await this.dbStorage.addObservations(observations);
    
    // Return the database result (should be the same as file result)
    return dbResult;
  }

  /**
   * Delete entities from the knowledge graph
   * @param entityNames Entity names to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    // Delete entities from both storages
    await Promise.all([
      this.fileStorage.deleteEntities(entityNames),
      this.dbStorage.deleteEntities(entityNames)
    ]);
  }

  /**
   * Delete observations from entities
   * @param deletions Observations to delete
   */
  async deleteObservations(deletions: DeleteObservationsParams[]): Promise<void> {
    // Delete observations from both storages
    await Promise.all([
      this.fileStorage.deleteObservations(deletions),
      this.dbStorage.deleteObservations(deletions)
    ]);
  }

  /**
   * Delete relations from the knowledge graph
   * @param relations Relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    // Delete relations from both storages
    await Promise.all([
      this.fileStorage.deleteRelations(relations),
      this.dbStorage.deleteRelations(relations)
    ]);
  }

  /**
   * Read the entire knowledge graph
   * @returns Complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    // Read from the preferred storage
    return this.preferDb 
      ? this.dbStorage.readGraph() 
      : this.fileStorage.readGraph();
  }

  /**
   * Search for nodes in the knowledge graph
   * @param query Search query
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    // Search in the preferred storage
    return this.preferDb 
      ? this.dbStorage.searchNodes(query) 
      : this.fileStorage.searchNodes(query);
  }

  /**
   * Open specific nodes in the knowledge graph
   * @param names Entity names to open
   * @returns Knowledge graph with requested entities and their relations
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    // Open nodes in the preferred storage
    return this.preferDb 
      ? this.dbStorage.openNodes(names) 
      : this.fileStorage.openNodes(names);
  }

  /**
   * Search for entities by entity type
   * @param entityType Entity type to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByEntityType(entityType: string): Promise<KnowledgeGraph> {
    // Search in the preferred storage
    return this.preferDb 
      ? this.dbStorage.searchByEntityType(entityType) 
      : this.fileStorage.searchByEntityType(entityType);
  }

  /**
   * Search for entities by observation content
   * @param observation Observation content to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByObservation(observation: string): Promise<KnowledgeGraph> {
    // Search in the preferred storage
    return this.preferDb 
      ? this.dbStorage.searchByObservation(observation) 
      : this.fileStorage.searchByObservation(observation);
  }

  /**
   * Get relations between two entities
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Array of relations between the entities
   */
  async getRelationsBetween(fromEntity: string, toEntity: string): Promise<Relation[]> {
    // Get relations from the preferred storage
    return this.preferDb 
      ? this.dbStorage.getRelationsBetween(fromEntity, toEntity) 
      : this.fileStorage.getRelationsBetween(fromEntity, toEntity);
  }

  /**
   * Advanced search with multiple parameters
   * @param params Search parameters
   * @returns Knowledge graph with matching entities and their relations
   */
  async advancedSearch(params: SearchParams): Promise<KnowledgeGraph> {
    // Search in the preferred storage
    return this.preferDb 
      ? this.dbStorage.advancedSearch(params) 
      : this.fileStorage.advancedSearch(params);
  }
}
