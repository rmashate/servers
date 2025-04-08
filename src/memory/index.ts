#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from 'path';
import { fileURLToPath } from 'url';

// Import from our models
import {
  Entity,
  Relation,
  KnowledgeGraph,
  AddObservationsParams,
  SearchParams,
} from './models/knowledge-graph';

// Import storage and cache implementations
import { Storage } from './storage';
import { createStorage } from './storage/factory';
import { createKnowledgeGraphCache } from './cache/lru-cache';

// Define memory file path using environment variable with fallback
const defaultMemoryPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.json');

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = process.env.MEMORY_FILE_PATH
  ? path.isAbsolute(process.env.MEMORY_FILE_PATH)
    ? process.env.MEMORY_FILE_PATH
    : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.MEMORY_FILE_PATH)
  : defaultMemoryPath;

// Define database path using environment variable with fallback
const defaultDbPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'memory.db');

// If DB_PATH is just a filename, put it in the same directory as the script
const DB_PATH = process.env.DB_PATH
  ? path.isAbsolute(process.env.DB_PATH)
    ? process.env.DB_PATH
    : path.join(path.dirname(fileURLToPath(import.meta.url)), process.env.DB_PATH)
  : defaultDbPath;

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager {
  private storage: Storage;
  private cache: ReturnType<typeof createKnowledgeGraphCache>;
  
  constructor(storage: Storage) {
    this.storage = storage;
    this.cache = createKnowledgeGraphCache({
      maxSize: Number(process.env.CACHE_SIZE) || 1000,
      ttl: Number(process.env.CACHE_TTL) || 5 * 60 * 1000 // Default: 5 minutes
    });
  }

  // Use the storage abstraction for all operations

  async createEntities(entities: Entity[]): Promise<Entity[]> {
    const result = await this.storage.createEntities(entities);
    
    // Invalidate the cache
    this.cache.invalidate();
    
    return result;
  }

  async createRelations(relations: Relation[]): Promise<Relation[]> {
    const result = await this.storage.createRelations(relations);
    
    // Invalidate the cache
    this.cache.invalidate();
    
    return result;
  }

  async addObservations(observations: AddObservationsParams[]): Promise<{ entityName: string; addedObservations: string[] }[]> {
    const result = await this.storage.addObservations(observations);
    
    // Invalidate the cache for affected entities
    for (const observation of observations) {
      this.cache.invalidateEntity(observation.entityName);
    }
    
    return result;
  }

  async deleteEntities(entityNames: string[]): Promise<void> {
    await this.storage.deleteEntities(entityNames);
    
    // Invalidate the cache
    this.cache.invalidate();
  }

  async deleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<void> {
    await this.storage.deleteObservations(deletions);
    
    // Invalidate the cache for affected entities
    for (const deletion of deletions) {
      this.cache.invalidateEntity(deletion.entityName);
    }
  }

  async deleteRelations(relations: Relation[]): Promise<void> {
    await this.storage.deleteRelations(relations);
    
    // Invalidate the cache
    this.cache.invalidate();
  }

  async readGraph(): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedGraph = this.cache.getGraph();
    if (cachedGraph) {
      return cachedGraph;
    }
    
    // Cache miss, get from storage
    const graph = await this.storage.readGraph();
    
    // Cache the result
    this.cache.setGraph(graph);
    
    return graph;
  }

  async searchNodes(query: string): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedResults = this.cache.getSearchResults(query);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.searchNodes(query);
    
    // Cache the results
    this.cache.setSearchResults(query, results);
    
    return results;
  }

  async openNodes(names: string[]): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedResults = this.cache.getNodeResults(names);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.openNodes(names);
    
    // Cache the results
    this.cache.setNodeResults(names, results);
    
    return results;
  }

  // New enhanced methods

  async searchByEntityType(entityType: string): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedResults = this.cache.getEntityTypeResults(entityType);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.searchByEntityType(entityType);
    
    // Cache the results
    this.cache.setEntityTypeResults(entityType, results);
    
    return results;
  }

  async searchByObservation(observation: string): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedResults = this.cache.getObservationResults(observation);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.searchByObservation(observation);
    
    // Cache the results
    this.cache.setObservationResults(observation, results);
    
    return results;
  }

  async getRelationsBetween(fromEntity: string, toEntity: string): Promise<Relation[]> {
    // Check the cache first
    const cachedResults = this.cache.getRelationResults(fromEntity, toEntity);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.getRelationsBetween(fromEntity, toEntity);
    
    // Cache the results
    this.cache.setRelationResults(fromEntity, toEntity, results);
    
    return results;
  }

  async advancedSearch(params: SearchParams): Promise<KnowledgeGraph> {
    // Check the cache first
    const cachedResults = this.cache.getAdvancedSearchResults(params);
    if (cachedResults) {
      return cachedResults;
    }
    
    // Cache miss, get from storage
    const results = await this.storage.advancedSearch(params);
    
    // Cache the results
    this.cache.setAdvancedSearchResults(params, results);
    
    return results;
  }
}

// Create the storage implementation
let knowledgeGraphManager: KnowledgeGraphManager;

// The server instance and tools exposed to Claude
const server = new Server({
  name: "memory-server",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_entities",
        description: "Create multiple new entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "The name of the entity" },
                  entityType: { type: "string", description: "The type of the entity" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents associated with the entity"
                  },
                },
                required: ["name", "entityType", "observations"],
              },
            },
          },
          required: ["entities"],
        },
      },
      {
        name: "create_relations",
        description: "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
        inputSchema: {
          type: "object",
          properties: {
            relations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "add_observations",
        description: "Add new observations to existing entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            observations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity to add the observations to" },
                  contents: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observation contents to add"
                  },
                },
                required: ["entityName", "contents"],
              },
            },
          },
          required: ["observations"],
        },
      },
      {
        name: "delete_entities",
        description: "Delete multiple entities and their associated relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            entityNames: { 
              type: "array", 
              items: { type: "string" },
              description: "An array of entity names to delete" 
            },
          },
          required: ["entityNames"],
        },
      },
      {
        name: "delete_observations",
        description: "Delete specific observations from entities in the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            deletions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  entityName: { type: "string", description: "The name of the entity containing the observations" },
                  observations: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "An array of observations to delete"
                  },
                },
                required: ["entityName", "observations"],
              },
            },
          },
          required: ["deletions"],
        },
      },
      {
        name: "delete_relations",
        description: "Delete multiple relations from the knowledge graph",
        inputSchema: {
          type: "object",
          properties: {
            relations: { 
              type: "array", 
              items: {
                type: "object",
                properties: {
                  from: { type: "string", description: "The name of the entity where the relation starts" },
                  to: { type: "string", description: "The name of the entity where the relation ends" },
                  relationType: { type: "string", description: "The type of the relation" },
                },
                required: ["from", "to", "relationType"],
              },
              description: "An array of relations to delete" 
            },
          },
          required: ["relations"],
        },
      },
      {
        name: "read_graph",
        description: "Read the entire knowledge graph",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_nodes",
        description: "Search for nodes in the knowledge graph based on a query",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query to match against entity names, types, and observation content" },
          },
          required: ["query"],
        },
      },
      {
        name: "open_nodes",
        description: "Open specific nodes in the knowledge graph by their names",
        inputSchema: {
          type: "object",
          properties: {
            names: {
              type: "array",
              items: { type: "string" },
              description: "An array of entity names to retrieve",
            },
          },
          required: ["names"],
        },
      },
      // New enhanced tools
      {
        name: "search_by_entity_type",
        description: "Search for entities by entity type",
        inputSchema: {
          type: "object",
          properties: {
            entityType: { type: "string", description: "The entity type to search for" },
          },
          required: ["entityType"],
        },
      },
      {
        name: "search_by_observation",
        description: "Search for entities by observation content",
        inputSchema: {
          type: "object",
          properties: {
            observation: { type: "string", description: "The observation content to search for" },
          },
          required: ["observation"],
        },
      },
      {
        name: "get_relations_between",
        description: "Get relations between two entities",
        inputSchema: {
          type: "object",
          properties: {
            fromEntity: { type: "string", description: "The source entity name" },
            toEntity: { type: "string", description: "The target entity name" },
          },
          required: ["fromEntity", "toEntity"],
        },
      },
      {
        name: "advanced_search",
        description: "Advanced search with multiple parameters",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
            entityType: { type: "string", description: "The entity type to filter by (optional)" },
            limitEntities: { type: "number", description: "Maximum number of entities to return (optional)" },
            limitRelations: { type: "number", description: "Maximum number of relations to return (optional)" },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error(`No arguments provided for tool: ${name}`);
  }

  // Ensure we have initialized the storage and knowledge graph manager
  if (!knowledgeGraphManager) {
    throw new Error("Knowledge graph manager not initialized");
  }

  switch (name) {
    case "create_entities":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createEntities(args.entities as Entity[]), null, 2) }] };
    case "create_relations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.createRelations(args.relations as Relation[]), null, 2) }] };
    case "add_observations":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.addObservations(args.observations as AddObservationsParams[]), null, 2) }] };
    case "delete_entities":
      await knowledgeGraphManager.deleteEntities(args.entityNames as string[]);
      return { content: [{ type: "text", text: "Entities deleted successfully" }] };
    case "delete_observations":
      await knowledgeGraphManager.deleteObservations(args.deletions as { entityName: string; observations: string[] }[]);
      return { content: [{ type: "text", text: "Observations deleted successfully" }] };
    case "delete_relations":
      await knowledgeGraphManager.deleteRelations(args.relations as Relation[]);
      return { content: [{ type: "text", text: "Relations deleted successfully" }] };
    case "read_graph":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.readGraph(), null, 2) }] };
    case "search_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchNodes(args.query as string), null, 2) }] };
    case "open_nodes":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.openNodes(args.names as string[]), null, 2) }] };
    // New enhanced tools
    case "search_by_entity_type":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchByEntityType(args.entityType as string), null, 2) }] };
    case "search_by_observation":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.searchByObservation(args.observation as string), null, 2) }] };
    case "get_relations_between":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.getRelationsBetween(args.fromEntity as string, args.toEntity as string), null, 2) }] };
    case "advanced_search":
      return { content: [{ type: "text", text: JSON.stringify(await knowledgeGraphManager.advancedSearch(args as SearchParams), null, 2) }] };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  try {
    console.error("Initializing Memory MCP Server...");
    
    // Create the storage implementation
    const storage = await createStorage({
      filePath: MEMORY_FILE_PATH,
      dbPath: DB_PATH,
      storageType: (process.env.STORAGE_TYPE || 'combined') as 'file' | 'db' | 'combined'
    });
    
    // Initialize the storage
    await storage.initialize();
    
    // Create the knowledge graph manager
    knowledgeGraphManager = new KnowledgeGraphManager(storage);
    
    console.error("Memory MCP Server initialized successfully!");
    console.error(`- Using storage type: ${process.env.STORAGE_TYPE || 'combined'}`);
    console.error(`- File path: ${MEMORY_FILE_PATH}`);
    console.error(`- Database path: ${DB_PATH}`);
    
    // Connect to the transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Knowledge Graph MCP Server running on stdio");
  } catch (error) {
    console.error("Error initializing Memory MCP Server:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
