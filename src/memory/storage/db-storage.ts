/**
 * Database Storage Implementation for Memory MCP
 * 
 * This implementation uses SQLite to store the knowledge graph.
 * It provides better performance for large datasets and more
 * advanced query capabilities.
 */

import { Database, verbose } from 'better-sqlite3';
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
import path from 'path';
import fs from 'fs';

// Enable verbose logging in dev environment
if (process.env.NODE_ENV === 'development') {
  verbose();
}

/**
 * SQLite database storage implementation
 */
export class DbStorage implements Storage {
  private db: Database;
  private initialized: boolean = false;

  /**
   * Create a new database storage instance
   * @param dbPath Path to the database file
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath, { fileMustExist: false });
    this.db.pragma('journal_mode = WAL');  // Use Write-Ahead Log for better concurrency
    this.db.pragma('foreign_keys = ON');   // Enable foreign key constraints
  }

  /**
   * Initialize the database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create tables
    this.db.exec(`
      -- Entities table
      CREATE TABLE IF NOT EXISTS entities (
        name TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Observations table
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (entity_name) REFERENCES entities(name) ON DELETE CASCADE
      );

      -- Relations table
      CREATE TABLE IF NOT EXISTS relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_entity TEXT NOT NULL,
        to_entity TEXT NOT NULL,
        relation_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(from_entity, to_entity, relation_type),
        FOREIGN KEY (from_entity) REFERENCES entities(name) ON DELETE CASCADE,
        FOREIGN KEY (to_entity) REFERENCES entities(name) ON DELETE CASCADE
      );

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_observations_entity_name ON observations(entity_name);
      CREATE INDEX IF NOT EXISTS idx_relations_from_entity ON relations(from_entity);
      CREATE INDEX IF NOT EXISTS idx_relations_to_entity ON relations(to_entity);
      CREATE INDEX IF NOT EXISTS idx_entities_entity_type ON entities(entity_type);
    `);

    // Create virtual table for full-text search
    try {
      this.db.exec(`
        -- Create virtual table for full-text search
        CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
          content,
          entity_name UNINDEXED,
          content='observations',
          content_rowid='id'
        );
        
        -- Create triggers to keep FTS index updated
        CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
          INSERT INTO observations_fts(rowid, content, entity_name) 
          VALUES (new.id, new.content, new.entity_name);
        END;
        
        CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
          INSERT INTO observations_fts(observations_fts, rowid, content, entity_name) 
          VALUES('delete', old.id, old.content, old.entity_name);
        END;
      `);
    } catch (error) {
      console.warn('FTS5 not available, falling back to basic search:', error);
    }

    this.initialized = true;
  }

  /**
   * Perform database maintenance
   */
  async maintenance(): Promise<void> {
    this.db.pragma('vacuum');
    this.db.pragma('optimize');
    
    try {
      this.db.exec('INSERT INTO observations_fts(observations_fts) VALUES("optimize")');
    } catch (error) {
      // Ignore errors if FTS is not available
    }
  }

  /**
   * Convert an entity from the database format to the API format
   * @param entity Entity from the database
   * @param observations Observations for the entity
   * @returns Entity in API format
   */
  private entityFromDb(entity: any, observations: string[]): Entity {
    return {
      name: entity.name,
      entityType: entity.entity_type,
      observations,
      created_at: entity.created_at,
      updated_at: entity.updated_at
    };
  }

  /**
   * Convert a relation from the database format to the API format
   * @param relation Relation from the database
   * @returns Relation in API format
   */
  private relationFromDb(relation: any): Relation {
    return {
      from: relation.from_entity,
      to: relation.to_entity,
      relationType: relation.relation_type,
      created_at: relation.created_at,
      updated_at: relation.updated_at
    };
  }

  /**
   * Create new entities in the knowledge graph
   * @param entities Entities to create
   * @returns Created entities
   */
  async createEntities(entities: Entity[]): Promise<Entity[]> {
    if (!this.initialized) await this.initialize();
    
    const insertEntity = this.db.prepare(`
      INSERT OR IGNORE INTO entities (name, entity_type, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    
    const insertObservation = this.db.prepare(`
      INSERT INTO observations (entity_name, content, created_at)
      VALUES (?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const createdEntities: Entity[] = [];
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((entities: Entity[]) => {
      for (const entity of entities) {
        // Check if the entity already exists
        const existingEntity = this.db.prepare('SELECT name FROM entities WHERE name = ?')
          .get(entity.name);
        
        if (!existingEntity) {
          // Insert the entity
          insertEntity.run(
            entity.name,
            entity.entityType,
            now,
            now
          );
          
          // Insert observations
          for (const observation of entity.observations || []) {
            insertObservation.run(
              entity.name,
              observation,
              now
            );
          }
          
          // Add to created entities
          createdEntities.push({
            ...entity,
            created_at: now,
            updated_at: now
          });
        }
      }
      
      return createdEntities;
    });
    
    return transaction(entities);
  }

  /**
   * Create new relations in the knowledge graph
   * @param relations Relations to create
   * @returns Created relations
   */
  async createRelations(relations: Relation[]): Promise<Relation[]> {
    if (!this.initialized) await this.initialize();
    
    const insertRelation = this.db.prepare(`
      INSERT OR IGNORE INTO relations (from_entity, to_entity, relation_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const now = new Date().toISOString();
    const createdRelations: Relation[] = [];
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((relations: Relation[]) => {
      for (const relation of relations) {
        // Check if the entities exist
        const fromEntity = this.db.prepare('SELECT name FROM entities WHERE name = ?')
          .get(relation.from);
        
        const toEntity = this.db.prepare('SELECT name FROM entities WHERE name = ?')
          .get(relation.to);
        
        if (!fromEntity || !toEntity) {
          console.warn(`Skipping relation with non-existent entity: ${relation.from} -> ${relation.to}`);
          continue;
        }
        
        // Check if the relation already exists
        const existingRelation = this.db.prepare(`
          SELECT id FROM relations 
          WHERE from_entity = ? AND to_entity = ? AND relation_type = ?
        `).get(relation.from, relation.to, relation.relationType);
        
        if (!existingRelation) {
          // Insert the relation
          const result = insertRelation.run(
            relation.from,
            relation.to,
            relation.relationType,
            now,
            now
          );
          
          if (result.changes > 0) {
            // Add to created relations
            createdRelations.push({
              ...relation,
              created_at: now,
              updated_at: now
            });
          }
        }
      }
      
      return createdRelations;
    });
    
    return transaction(relations);
  }

  /**
   * Add observations to entities
   * @param observations Observations to add
   * @returns Added observations
   */
  async addObservations(observations: AddObservationsParams[]): Promise<AddObservationsResult[]> {
    if (!this.initialized) await this.initialize();
    
    const insertObservation = this.db.prepare(`
      INSERT INTO observations (entity_name, content, created_at)
      VALUES (?, ?, ?)
    `);
    
    const updateEntity = this.db.prepare(`
      UPDATE entities SET updated_at = ? WHERE name = ?
    `);
    
    const now = new Date().toISOString();
    const results: AddObservationsResult[] = [];
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((observations: AddObservationsParams[]) => {
      for (const obs of observations) {
        // Check if the entity exists
        const entity = this.db.prepare('SELECT name FROM entities WHERE name = ?')
          .get(obs.entityName);
        
        if (!entity) {
          throw new Error(`Entity with name ${obs.entityName} not found`);
        }
        
        // Get existing observations
        const existingObservations = this.db.prepare(`
          SELECT content FROM observations WHERE entity_name = ?
        `).all(obs.entityName).map(row => row.content);
        
        // Filter out observations that already exist
        const newObservations = obs.contents.filter(content => 
          !existingObservations.includes(content)
        );
        
        // Insert new observations
        for (const content of newObservations) {
          insertObservation.run(
            obs.entityName,
            content,
            now
          );
        }
        
        // Update entity timestamp
        if (newObservations.length > 0) {
          updateEntity.run(now, obs.entityName);
        }
        
        // Add to results
        results.push({
          entityName: obs.entityName,
          addedObservations: newObservations
        });
      }
      
      return results;
    });
    
    return transaction(observations);
  }

  /**
   * Delete entities from the knowledge graph
   * @param entityNames Entity names to delete
   */
  async deleteEntities(entityNames: string[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((entityNames: string[]) => {
      for (const name of entityNames) {
        // Delete the entity (cascades to observations and relations)
        this.db.prepare('DELETE FROM entities WHERE name = ?').run(name);
      }
    });
    
    transaction(entityNames);
  }

  /**
   * Delete observations from entities
   * @param deletions Observations to delete
   */
  async deleteObservations(deletions: DeleteObservationsParams[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    const updateEntity = this.db.prepare(`
      UPDATE entities SET updated_at = ? WHERE name = ?
    `);
    
    const now = new Date().toISOString();
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((deletions: DeleteObservationsParams[]) => {
      for (const deletion of deletions) {
        // Check if the entity exists
        const entity = this.db.prepare('SELECT name FROM entities WHERE name = ?')
          .get(deletion.entityName);
        
        if (!entity) {
          continue;
        }
        
        // Delete observations
        for (const observation of deletion.observations) {
          this.db.prepare(`
            DELETE FROM observations 
            WHERE entity_name = ? AND content = ?
          `).run(deletion.entityName, observation);
        }
        
        // Update entity timestamp
        updateEntity.run(now, deletion.entityName);
      }
    });
    
    transaction(deletions);
  }

  /**
   * Delete relations from the knowledge graph
   * @param relations Relations to delete
   */
  async deleteRelations(relations: Relation[]): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    // Use a transaction for better performance and data integrity
    const transaction = this.db.transaction((relations: Relation[]) => {
      for (const relation of relations) {
        this.db.prepare(`
          DELETE FROM relations 
          WHERE from_entity = ? AND to_entity = ? AND relation_type = ?
        `).run(relation.from, relation.to, relation.relationType);
      }
    });
    
    transaction(relations);
  }

  /**
   * Read the entire knowledge graph
   * @returns Complete knowledge graph
   */
  async readGraph(): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    // Get all entities
    const entities: Entity[] = [];
    const dbEntities = this.db.prepare(`
      SELECT name, entity_type, created_at, updated_at FROM entities
    `).all();
    
    for (const dbEntity of dbEntities) {
      // Get observations for this entity
      const observations = this.db.prepare(`
        SELECT content FROM observations WHERE entity_name = ?
      `).all(dbEntity.name).map(row => row.content);
      
      entities.push(this.entityFromDb(dbEntity, observations));
    }
    
    // Get all relations
    const relations: Relation[] = [];
    const dbRelations = this.db.prepare(`
      SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
    `).all();
    
    for (const dbRelation of dbRelations) {
      relations.push(this.relationFromDb(dbRelation));
    }
    
    return { entities, relations };
  }

  /**
   * Search for nodes in the knowledge graph
   * @param query Search query
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchNodes(query: string): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    // Convert query to lowercase for case-insensitive search
    const lowercaseQuery = `%${query.toLowerCase()}%`;
    
    // Try to use FTS if available
    let matchingEntities = new Set<string>();
    try {
      // Search observations using FTS
      const ftsResults = this.db.prepare(`
        SELECT entity_name FROM observations_fts
        WHERE content MATCH ?
      `).all(query).map(row => row.entity_name);
      
      ftsResults.forEach(name => matchingEntities.add(name));
    } catch (error) {
      // Fall back to basic search
      const observationResults = this.db.prepare(`
        SELECT DISTINCT entity_name FROM observations
        WHERE lower(content) LIKE ?
      `).all(lowercaseQuery).map(row => row.entity_name);
      
      observationResults.forEach(name => matchingEntities.add(name));
    }
    
    // Search entity names and types
    const entityResults = this.db.prepare(`
      SELECT name FROM entities
      WHERE lower(name) LIKE ? OR lower(entity_type) LIKE ?
    `).all(lowercaseQuery, lowercaseQuery).map(row => row.name);
    
    entityResults.forEach(name => matchingEntities.add(name));
    
    // Get full entities with observations
    const entities: Entity[] = [];
    for (const name of matchingEntities) {
      const dbEntity = this.db.prepare(`
        SELECT name, entity_type, created_at, updated_at FROM entities
        WHERE name = ?
      `).get(name);
      
      if (dbEntity) {
        const observations = this.db.prepare(`
          SELECT content FROM observations WHERE entity_name = ?
        `).all(name).map(row => row.content);
        
        entities.push(this.entityFromDb(dbEntity, observations));
      }
    }
    
    // Get relations between the matching entities
    const entityNames = new Set(entities.map(e => e.name));
    const relations: Relation[] = [];
    
    if (entityNames.size > 0) {
      const placeholders = Array.from(entityNames).map(() => '?').join(', ');
      const dbRelations = this.db.prepare(`
        SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
        WHERE from_entity IN (${placeholders})
          AND to_entity IN (${placeholders})
      `).all(...Array.from(entityNames), ...Array.from(entityNames));
      
      for (const dbRelation of dbRelations) {
        relations.push(this.relationFromDb(dbRelation));
      }
    }
    
    return { entities, relations };
  }

  /**
   * Open specific nodes in the knowledge graph
   * @param names Entity names to open
   * @returns Knowledge graph with requested entities and their relations
   */
  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    if (names.length === 0) {
      return { entities: [], relations: [] };
    }
    
    // Get entities
    const entities: Entity[] = [];
    for (const name of names) {
      const dbEntity = this.db.prepare(`
        SELECT name, entity_type, created_at, updated_at FROM entities
        WHERE name = ?
      `).get(name);
      
      if (dbEntity) {
        const observations = this.db.prepare(`
          SELECT content FROM observations WHERE entity_name = ?
        `).all(name).map(row => row.content);
        
        entities.push(this.entityFromDb(dbEntity, observations));
      }
    }
    
    // Get relations between the entities
    const entityNames = entities.map(e => e.name);
    const relations: Relation[] = [];
    
    if (entityNames.length > 0) {
      const placeholders = entityNames.map(() => '?').join(', ');
      const dbRelations = this.db.prepare(`
        SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
        WHERE from_entity IN (${placeholders})
          AND to_entity IN (${placeholders})
      `).all(...entityNames, ...entityNames);
      
      for (const dbRelation of dbRelations) {
        relations.push(this.relationFromDb(dbRelation));
      }
    }
    
    return { entities, relations };
  }

  /**
   * Search for entities by entity type
   * @param entityType Entity type to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByEntityType(entityType: string): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    // Convert entityType to lowercase for case-insensitive search
    const lowercaseEntityType = entityType.toLowerCase();
    
    // Get entities of the specified type
    const dbEntities = this.db.prepare(`
      SELECT name, entity_type, created_at, updated_at FROM entities
      WHERE lower(entity_type) = ?
    `).all(lowercaseEntityType);
    
    // Get full entities with observations
    const entities: Entity[] = [];
    for (const dbEntity of dbEntities) {
      const observations = this.db.prepare(`
        SELECT content FROM observations WHERE entity_name = ?
      `).all(dbEntity.name).map(row => row.content);
      
      entities.push(this.entityFromDb(dbEntity, observations));
    }
    
    // Get relations between the entities
    const entityNames = entities.map(e => e.name);
    const relations: Relation[] = [];
    
    if (entityNames.length > 0) {
      const placeholders = entityNames.map(() => '?').join(', ');
      const dbRelations = this.db.prepare(`
        SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
        WHERE from_entity IN (${placeholders})
          AND to_entity IN (${placeholders})
      `).all(...entityNames, ...entityNames);
      
      for (const dbRelation of dbRelations) {
        relations.push(this.relationFromDb(dbRelation));
      }
    }
    
    return { entities, relations };
  }

  /**
   * Search for entities by observation content
   * @param observation Observation content to search for
   * @returns Knowledge graph with matching entities and their relations
   */
  async searchByObservation(observation: string): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    // Try to use FTS if available
    let entityNames: string[] = [];
    try {
      // Search observations using FTS
      entityNames = this.db.prepare(`
        SELECT entity_name FROM observations_fts
        WHERE content MATCH ?
      `).all(observation).map(row => row.entity_name);
    } catch (error) {
      // Fall back to basic search
      const lowercaseObservation = `%${observation.toLowerCase()}%`;
      entityNames = this.db.prepare(`
        SELECT DISTINCT entity_name FROM observations
        WHERE lower(content) LIKE ?
      `).all(lowercaseObservation).map(row => row.entity_name);
    }
    
    // Get full entities with observations
    const entities: Entity[] = [];
    for (const name of entityNames) {
      const dbEntity = this.db.prepare(`
        SELECT name, entity_type, created_at, updated_at FROM entities
        WHERE name = ?
      `).get(name);
      
      if (dbEntity) {
        const observations = this.db.prepare(`
          SELECT content FROM observations WHERE entity_name = ?
        `).all(name).map(row => row.content);
        
        entities.push(this.entityFromDb(dbEntity, observations));
      }
    }
    
    // Get relations between the entities
    const relations: Relation[] = [];
    
    if (entityNames.length > 0) {
      const placeholders = entityNames.map(() => '?').join(', ');
      const dbRelations = this.db.prepare(`
        SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
        WHERE from_entity IN (${placeholders})
          AND to_entity IN (${placeholders})
      `).all(...entityNames, ...entityNames);
      
      for (const dbRelation of dbRelations) {
        relations.push(this.relationFromDb(dbRelation));
      }
    }
    
    return { entities, relations };
  }

  /**
   * Get relations between two entities
   * @param fromEntity Source entity name
   * @param toEntity Target entity name
   * @returns Array of relations between the entities
   */
  async getRelationsBetween(fromEntity: string, toEntity: string): Promise<Relation[]> {
    if (!this.initialized) await this.initialize();
    
    const dbRelations = this.db.prepare(`
      SELECT from_entity, to_entity, relation_type, created_at, updated_at FROM relations
      WHERE from_entity = ? AND to_entity = ?
    `).all(fromEntity, toEntity);
    
    const relations: Relation[] = [];
    for (const dbRelation of dbRelations) {
      relations.push(this.relationFromDb(dbRelation));
    }
    
    return relations;
  }

  /**
   * Advanced search with multiple parameters
   * @param params Search parameters
   * @returns Knowledge graph with matching entities and their relations
   */
  async advancedSearch(params: SearchParams): Promise<KnowledgeGraph> {
    if (!this.initialized) await this.initialize();
    
    // Start with a search by query
    let result = await this.searchNodes(params.query);
    
    // Further filter by entity type if specified
    if (params.entityType) {
      const entityTypeResult = await this.searchByEntityType(params.entityType);
      const entityTypeNames = new Set(entityTypeResult.entities.map(e => e.name));
      
      // Filter entities
      result.entities = result.entities.filter(e => entityTypeNames.has(e.name));
      
      // Filter relations
      const entityNames = new Set(result.entities.map(e => e.name));
      result.relations = result.relations.filter(r => 
        entityNames.has(r.from) && entityNames.has(r.to)
      );
    }
    
    // Limit entities if specified
    if (params.limitEntities && params.limitEntities > 0) {
      result.entities = result.entities.slice(0, params.limitEntities);
      
      // Filter relations to match limited entities
      const entityNames = new Set(result.entities.map(e => e.name));
      result.relations = result.relations.filter(r => 
        entityNames.has(r.from) && entityNames.has(r.to)
      );
    }
    
    // Limit relations if specified
    if (params.limitRelations && params.limitRelations > 0) {
      result.relations = result.relations.slice(0, params.limitRelations);
    }
    
    return result;
  }

  /**
   * Close the database connection
   */
  public close(): void {
    this.db.close();
  }
}
