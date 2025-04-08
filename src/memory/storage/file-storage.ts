/**
 * File Storage Implementation for Memory MCP
 * 
 * This implementation uses the file system to store the knowledge graph.
 * It's compatible with the original implementation but adds optimizations
 * for better performance and reliability.
 */

import { promises as fs } from 'fs';
import path from 'path';
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
 * File-based storage implementation
 */
export class FileStorage implements Storage {
  private filePath: string;
  private fileAccessLock: Promise<void> = Promise.resolve();

  /**
   * Create a new file storage instance
   * @param filePath Path to the storage file
   */
  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Load the knowledge graph from file
   * @returns Knowledge graph loaded from file
   */
  private async loadGraph(): Promise<KnowledgeGraph> {
    try {
      // Use a lock to prevent concurrent file access
      await this.fileAccessLock;
      
      const data = await fs.readFile(this.filePath, "utf-8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      return lines.reduce((graph: KnowledgeGraph, line) => {
        try {
          const item = JSON.parse(line);
          if (item.type === "entity") {
            const { type, ...entity } = item;
            graph.entities.push(entity as Entity);
          }
          if (item.type === "relation") {
            const { type, ...relation } = item;
            graph.relations.push(relation as Relation);
          }
        } catch (error) {
          console.error("Error parsing line:", line, error);
        }
        return graph;
      }, { entities: [], relations: [] });
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as any).code === "ENOENT") {
        return { entities: [], relations: [] };
      }
      throw error;
    }
  }

  /**
   * Save the knowledge graph to file
   * @param graph Knowledge graph to save
   */
  private async saveGraph(graph: KnowledgeGraph): Promise<void> {
    // Create a new lock
    const lock = new Promise<void>(async (resolve) => {
      // Wait for any previous operations to complete
      await this.fileAccessLock;
      
      try {
        const lines = [
          ...graph.entities.map(e => JSON.stringify({ type: "entity", ...e })),
          ...graph.relations.map(r => JSON.stringify({ type: "relation", ...r })),
        ];
        await fs.writeFile(this.filePath, lines.join("\n"));
      } finally {
        // Release the lock
        resolve();
      }
    });
    
    // Set the current lock
    this.fileAccessLock = lock;
    
    // Wait for the operation to complete
    await lock;
  }

  /**
   * Initialize the storage
   */
  async initialize(): Promise<void> {
    // Ensure the directory exists
    try {
      const directory = path.dirname(this.filePath);
      await fs.mkdir(directory, { recursive: true });
    } catch (error) {
      // Ignore errors - directory might already exist
    }
    
    // Create an empty file if it doesn't exist
    try {
      await fs.access(this.filePath);
    } catch (error) {
      await fs.writeFile(this.filePath, "");
    }
  }

  /**
   * Perform maintenance tasks
   */
  async maintenance(): Promise<void> {
    // Compact the file by rewriting it
    const graph = await this.loadGraph();
    await this.saveGraph(graph);
  }

  /**
   * Create new entities in the knowledge graph
   * @param entities Entities to create
   * @returns Created entities
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const graph = await this.loadGraph();
    
    // Add timestamp metadata
    const now = new Date().toISOString();
    const enrichedEntities = entities.map(entity => ({
      ...entity,
      created_at: now,
      updated_at: now
    }));
    
    // Filter out entities that already exist
    const newEntities = enrichedEntities.filter(e => 
      !graph.entities.some(existingEntity => existingEntity.name === e.name)
    );
    
    // Add new entities to the graph
    graph.entities.push(...newEntities);
    
    // Save the updated graph
    await this.saveGraph(graph);
    
    return newEntities;
  }

  /**
   * Create new relations in the knowledge graph
   * @param relations Relations to create
   * @returns Created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const graph = await this.loadGraph();
    
    // Add timestamp metadata
    const now = new Date().toISOString();
    const enrichedRelations = relations.map(relation => ({
      ...relation,
      created_at: now,
      updated_at: now
    }));
    
    // Filter out relations that already exist
    const newRelations = enrichedRelations.filter(r => 
      !graph.relations.some(existingRelation => 
        existingRelation.from === r.from && 
        existingRelation.to === r.to && 
        existingRelation.relationType === r.relationType
      )
    );
    
    // Add new relations to the graph
    graph.relations.push(...newRelations);
    
    // Save the updated graph
    await this.saveGraph(graph);
    
    return newRelations;
  }

  /**
   * Add observations to entities
   * @param observations Observations to add
   * @returns Added observations
   */
  async addObservations(observations: AddObservationsParams[]): Promise<AddObservationsResult[]> {
    const graph = await this.loadGraph();
    const now = new Date().toISOString();
    
    const results: AddObservationsResult[] = [];
    
    for (const obs of observations) {
      const entity = graph.entities.find(e => e.name === obs.entityName);
      
      if (!entity) {
        throw new Error(`Entity with name ${obs.entityName} not found`);
      }
      
      // Filter out observations that already exist
      const newObservations = obs.contents.filter(content => 
        !entity.observations.includes(content)
      );
      
      // Add new observations to the entity
      entity.observations.push(...newObservations);
      
      // Update the entity's timestamp
      entity.updated_at = now;
      
      // Add to results
      results.push({
        entityName: obs.entityName,
        addedObservations: newObservations
      });
    }
    
    // Save the updated graph
    await this.saveGraph(graph);
    
    return results;
  }

  /**
   * Delete entities from the knowledge graph
   * @param entityNames Entity names to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    const graph = await this.loadGraph();
    
    // Filter out the entities to delete
    graph.entities = graph.entities.filter(e => !entityNames.includes(e.name));
    
    // Filter out relations that reference the deleted entities
    graph.relations = graph.relations.filter(r => 
      !entityNames.includes(r.from) && !entityNames.includes(r.to)
    );
    
    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Delete observations from entities
   * @param deletions Observations to delete
   */
  async deleteObservations(deletions: DeleteObservationsParams[]): Promise<void> {
    const graph = await this.loadGraph();
    const now = new Date().toISOString();
    
    // Process each deletion
    for (const deletion of deletions) {
      const entity = graph.entities.find(e => e.name === deletion.entityName);
      
      if (entity) {
        // Filter out the observations to delete
        entity.observations = entity.observations.filter(o => 
          !deletion.observations.includes(o)
        );
        
        // Update the entity's timestamp
        entity.updated_at = now;
      }
    }
    
    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Delete relations from the knowledge graph
   * @param relations Relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    const graph = await this.loadGraph();
    
    // Filter out the relations to delete
    graph.relations = graph.relations.filter(r => 
      !relations.some(delRelation => 
        r.from === delRelation.from && 
        r.to === delRelation.to && 
        r.relationType === delRelation.relationType
      )
    );
    
    // Save the updated graph
    await this.saveGraph(graph);
  }

  /**
   * Read the entire knowledge graph
   * @returns Complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    return this.loadGraph();
  }

  /**
   * Search for nodes in the knowledge graph
   * @param query Search query
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Convert query to lowercase for case-insensitive search
    const lowercaseQuery = query.toLowerCase();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(lowercaseQuery) ||
      e.entityType.toLowerCase().includes(lowercaseQuery) ||
      e.observations.some(o => o.toLowerCase().includes(lowercaseQuery))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Open specific nodes in the knowledge graph
   * @param names Entity names to open
   * @returns Knowledge graph with requested entities and their relations
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => names.includes(e.name));
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Search for entities by entity type
   * @param entityType Entity type to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByEntityType(entityType: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Convert entityType to lowercase for case-insensitive search
    const lowercaseEntityType = entityType.toLowerCase();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.entityType.toLowerCase() === lowercaseEntityType
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Search for entities by observation content
   * @param observation Observation content to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByObservation(observation: string): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Convert observation to lowercase for case-insensitive search
    const lowercaseObservation = observation.toLowerCase();
    
    // Filter entities
    const filteredEntities = graph.entities.filter(e => 
      e.observations.some(o => o.toLowerCase().includes(lowercaseObservation))
    );
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    const filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }

  /**
   * Get relations between two entities
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Array of relations between the entities
   */
  async getRelationsBetween(fromEntity: string, toEntity: string): Promise<Relation[]> {
    const graph = await this.loadGraph();
    
    // Filter relations
    return graph.relations.filter(r => 
      r.from === fromEntity && r.to === toEntity
    );
  }

  /**
   * Advanced search with multiple parameters
   * @param params Search parameters
   * @returns Knowledge graph with matching entities and their relations
   */
  async advancedSearch(params: SearchParams): Promise<KnowledgeGraph> {
    const graph = await this.loadGraph();
    
    // Convert query to lowercase for case-insensitive search
    const lowercaseQuery = params.query.toLowerCase();
    
    // Filter entities
    let filteredEntities = graph.entities.filter(e => 
      e.name.toLowerCase().includes(lowercaseQuery) ||
      e.entityType.toLowerCase().includes(lowercaseQuery) ||
      e.observations.some(o => o.toLowerCase().includes(lowercaseQuery))
    );
    
    // Further filter by entity type if specified
    if (params.entityType) {
      const lowercaseEntityType = params.entityType.toLowerCase();
      filteredEntities = filteredEntities.filter(e => 
        e.entityType.toLowerCase() === lowercaseEntityType
      );
    }
    
    // Limit entities if specified
    if (params.limitEntities && params.limitEntities > 0) {
      filteredEntities = filteredEntities.slice(0, params.limitEntities);
    }
  
    // Create a Set of filtered entity names for quick lookup
    const filteredEntityNames = new Set(filteredEntities.map(e => e.name));
  
    // Filter relations to only include those between filtered entities
    let filteredRelations = graph.relations.filter(r => 
      filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
    );
    
    // Limit relations if specified
    if (params.limitRelations && params.limitRelations > 0) {
      filteredRelations = filteredRelations.slice(0, params.limitRelations);
    }
  
    return {
      entities: filteredEntities,
      relations: filteredRelations,
    };
  }
}
