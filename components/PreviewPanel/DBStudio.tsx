import React, { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Database, Table2, Key, Plus, Trash2, Sparkles,
  Copy, Check, Loader2, Wand2, Save,
  RefreshCw, Settings, ChevronDown
} from 'lucide-react';
import { getProviderManager } from '../../services/ai';
import { DATABASE_SCHEMA_SCHEMA } from '../../services/ai/utils/schemas';
import { FileSystem } from '../../types';

interface DBStudioProps {
  files: FileSystem;
  setFiles: (files: FileSystem) => void;
}

interface Column {
  name: string;
  type: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isNullable?: boolean;
  defaultValue?: string;
  references?: { table: string; column: string };
}

interface TableSchema {
  name: string;
  columns: Column[];
}

// Relations file structure for persisting edges and positions
interface RelationsData {
  version: number;
  positions: Record<string, { x: number; y: number }>;
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle: string | null;
    targetHandle: string | null;
    label?: string;
    relationType?: 'one-to-one' | 'one-to-many' | 'many-to-many';
  }[];
}

// Parse SQL to extract table schemas
function parseSQLToSchema(sql: string): { tables: TableSchema[], relationships: { from: string, to: string }[] } {
  const tables: TableSchema[] = [];
  const relationships: { from: string, to: string }[] = [];

  // Match CREATE TABLE statements
  const tableRegex = /CREATE TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;

  while ((match = tableRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnsStr = match[2];
    const columns: Column[] = [];

    // Parse each column
    const lines = columnsStr.split(',').map(l => l.trim()).filter(l => l && !l.startsWith('CONSTRAINT') && !l.startsWith('FOREIGN KEY') && !l.startsWith('PRIMARY KEY'));

    for (const line of lines) {
      const colMatch = line.match(/^(\w+)\s+(\w+(?:\(\d+(?:,\d+)?\))?)/i);
      if (colMatch) {
        const col: Column = {
          name: colMatch[1],
          type: colMatch[2].toUpperCase()
        };
        if (/PRIMARY\s+KEY/i.test(line)) col.isPrimaryKey = true;
        if (/NOT\s+NULL/i.test(line)) col.isNullable = false;
        if (/REFERENCES/i.test(line)) col.isForeignKey = true;
        columns.push(col);
      }
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns });
    }
  }

  // Parse ALTER TABLE for foreign keys
  const fkRegex = /ALTER TABLE\s+(\w+)\s+ADD CONSTRAINT.*?FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)/gi;
  while ((match = fkRegex.exec(sql)) !== null) {
    relationships.push({
      from: `${match[1]}.${match[2]}`,
      to: `${match[3]}.${match[4]}`
    });
  }

  return { tables, relationships };
}

// Custom Table Node Component
const TableNode: React.FC<{
  data: {
    table: TableSchema;
    onUpdate: (table: TableSchema) => void;
    onDelete: () => void;
  };
}> = ({ data }) => {
  const { table, onUpdate, onDelete } = data;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(table.name);

  const handleNameSubmit = () => {
    onUpdate({ ...table, name: editName });
    setIsEditing(false);
  };

  const addColumn = () => {
    onUpdate({
      ...table,
      columns: [...table.columns, { name: 'new_column', type: 'VARCHAR(255)' }]
    });
  };

  const updateColumn = (index: number, updates: Partial<Column>) => {
    const newColumns = [...table.columns];
    newColumns[index] = { ...newColumns[index], ...updates };
    onUpdate({ ...table, columns: newColumns });
  };

  const deleteColumn = (index: number) => {
    onUpdate({
      ...table,
      columns: table.columns.filter((_, i) => i !== index)
    });
  };

  const togglePrimaryKey = (index: number) => {
    const newColumns = [...table.columns];
    newColumns[index] = { ...newColumns[index], isPrimaryKey: !newColumns[index].isPrimaryKey };
    onUpdate({ ...table, columns: newColumns });
  };

  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl min-w-[220px] overflow-hidden">
      {/* Table Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 className="w-4 h-4 text-white" />
          {isEditing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
              className="bg-transparent border-b border-white/50 text-white text-sm font-semibold outline-none w-28"
              autoFocus
            />
          ) : (
            <span
              className="text-white text-sm font-semibold cursor-pointer hover:underline"
              onClick={() => setIsEditing(true)}
            >
              {table.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={addColumn}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="Add column"
          >
            <Plus className="w-3 h-3 text-white" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-500/50 rounded transition-colors"
            title="Delete table"
          >
            <Trash2 className="w-3 h-3 text-white" />
          </button>
        </div>
      </div>

      {/* Columns */}
      <div className="divide-y divide-slate-700">
        {table.columns.map((column, index) => (
          <div key={index} className="px-3 py-1.5 flex items-center gap-2 text-xs hover:bg-slate-700/50 group relative">
            <Handle
              type="source"
              position={Position.Right}
              id={`${table.name}-${column.name}-source`}
              className="!w-2 !h-2 !bg-blue-400 !border-slate-800"
            />
            <Handle
              type="target"
              position={Position.Left}
              id={`${table.name}-${column.name}-target`}
              className="!w-2 !h-2 !bg-purple-400 !border-slate-800"
            />

            <button
              onClick={() => togglePrimaryKey(index)}
              className={`flex-shrink-0 ${column.isPrimaryKey ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
              title="Toggle Primary Key"
            >
              <Key className="w-3 h-3" />
            </button>

            <input
              value={column.name}
              onChange={(e) => updateColumn(index, { name: e.target.value })}
              className="bg-transparent text-slate-200 flex-1 outline-none min-w-0 text-xs"
            />
            <select
              value={column.type}
              onChange={(e) => updateColumn(index, { type: e.target.value })}
              className="bg-slate-700 text-slate-400 text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer"
            >
              <option value="INT">INT</option>
              <option value="BIGINT">BIGINT</option>
              <option value="SERIAL">SERIAL</option>
              <option value="VARCHAR(255)">VARCHAR</option>
              <option value="TEXT">TEXT</option>
              <option value="BOOLEAN">BOOLEAN</option>
              <option value="DATE">DATE</option>
              <option value="DATETIME">DATETIME</option>
              <option value="TIMESTAMP">TIMESTAMP</option>
              <option value="DECIMAL(10,2)">DECIMAL</option>
              <option value="FLOAT">FLOAT</option>
              <option value="JSON">JSON</option>
              <option value="UUID">UUID</option>
            </select>
            <button
              onClick={() => deleteColumn(index)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/30 rounded transition-all"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = { table: TableNode };

// Generate SQL from schema
function generateSQL(tables: TableSchema[], edges: Edge[]): string {
  if (tables.length === 0) return '-- No tables defined yet\n';

  let sql = '-- Generated by FluidFlow DB Studio\n';
  sql += `-- Generated at: ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    sql += `CREATE TABLE ${table.name} (\n`;
    const columnDefs = table.columns.map(col => {
      let def = `  ${col.name} ${col.type}`;
      if (col.isPrimaryKey) def += ' PRIMARY KEY';
      if (col.isNullable === false && !col.isPrimaryKey) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      return def;
    });
    sql += columnDefs.join(',\n');
    sql += '\n);\n\n';
  }

  for (const edge of edges) {
    if (edge.sourceHandle && edge.targetHandle) {
      const sourceParts = edge.sourceHandle.split('-');
      const targetParts = edge.targetHandle.split('-');
      if (sourceParts.length >= 2 && targetParts.length >= 2) {
        const sourceTable = sourceParts[0];
        const sourceCol = sourceParts[1];
        const targetTable = targetParts[0];
        const targetCol = targetParts[1];
        sql += `ALTER TABLE ${sourceTable}\n`;
        sql += `  ADD CONSTRAINT fk_${sourceTable}_${sourceCol}\n`;
        sql += `  FOREIGN KEY (${sourceCol}) REFERENCES ${targetTable}(${targetCol});\n\n`;
      }
    }
  }

  return sql;
}

// Generate fake data
function generateFakeData(tables: TableSchema[], rowCount: number = 10): string {
  if (tables.length === 0) return '-- No tables to seed\n';

  let sql = '-- Sample data generated by FluidFlow DB Studio\n';
  sql += `-- Generated at: ${new Date().toISOString()}\n`;
  sql += `-- Rows per table: ${rowCount}\n\n`;

  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com'];
  const products = ['Laptop', 'Phone', 'Tablet', 'Watch', 'Headphones', 'Camera', 'Speaker', 'Monitor', 'Keyboard', 'Mouse'];
  const statuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

  for (const table of tables) {
    sql += `-- ${table.name} data\n`;

    for (let i = 1; i <= rowCount; i++) {
      const values = table.columns.map(col => {
        const colName = col.name.toLowerCase();
        if (col.isPrimaryKey) return i.toString();

        // Smart value generation based on column name
        if (colName.includes('email')) return `'${names[i % names.length].toLowerCase()}${i}@${domains[i % domains.length]}'`;
        if (colName.includes('name') && colName.includes('user')) return `'${names[i % names.length]}'`;
        if (colName.includes('name') && colName.includes('product')) return `'${products[i % products.length]}'`;
        if (colName.includes('name')) return `'${names[i % names.length]}'`;
        if (colName.includes('title')) return `'Title ${i}'`;
        if (colName.includes('description')) return `'Description for item ${i}'`;
        if (colName.includes('status')) return `'${statuses[i % statuses.length]}'`;
        if (colName.includes('price') || colName.includes('amount') || colName.includes('total')) return (Math.random() * 1000).toFixed(2);
        if (colName.includes('quantity') || colName.includes('count')) return Math.floor(Math.random() * 100).toString();
        if (colName.includes('_id') || colName.includes('id')) return Math.floor(Math.random() * rowCount + 1).toString();
        if (colName.includes('phone')) return `'+1${Math.floor(Math.random() * 9000000000 + 1000000000)}'`;
        if (colName.includes('address')) return `'${Math.floor(Math.random() * 9999)} Main St, City ${i}'`;

        switch (col.type.toUpperCase().split('(')[0]) {
          case 'INT':
          case 'BIGINT':
          case 'SERIAL':
            return Math.floor(Math.random() * 1000).toString();
          case 'VARCHAR':
          case 'TEXT':
            return `'Sample ${col.name} ${i}'`;
          case 'BOOLEAN':
            return Math.random() > 0.5 ? 'TRUE' : 'FALSE';
          case 'DATE':
            return `'2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}'`;
          case 'DATETIME':
          case 'TIMESTAMP':
            return `'2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')} ${String(Math.floor(Math.random() * 24)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00'`;
          case 'DECIMAL':
          case 'FLOAT':
            return (Math.random() * 1000).toFixed(2);
          case 'UUID':
            return `'${crypto.randomUUID()}'`;
          case 'JSON':
            return `'{"key": "value${i}"}'`;
          default:
            return 'NULL';
        }
      });

      sql += `INSERT INTO ${table.name} (${table.columns.map(c => c.name).join(', ')}) VALUES (${values.join(', ')});\n`;
    }
    sql += '\n';
  }

  return sql;
}

// Parse relations.json to restore edges and positions
function parseRelationsJson(json: string): RelationsData | null {
  try {
    const data = JSON.parse(json);
    if (data.version && data.positions && data.edges) {
      return data as RelationsData;
    }
  } catch (e) {
    console.error('Failed to parse relations.json:', e);
  }
  return null;
}

// Generate relations.json content
function generateRelationsJson(nodes: Node[], edges: Edge[]): string {
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach(node => {
    positions[node.id] = { x: node.position.x, y: node.position.y };
  });

  const relationsData: RelationsData = {
    version: 1,
    positions,
    edges: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null,
      label: typeof edge.label === 'string' ? edge.label : undefined,
      relationType: (edge.data?.relationType as RelationsData['edges'][0]['relationType']) || 'one-to-many'
    }))
  };

  return JSON.stringify(relationsData, null, 2);
}

// Convert RelationsData edges to ReactFlow edges
function relationsToEdges(relations: RelationsData): Edge[] {
  return relations.edges.map(rel => ({
    id: rel.id,
    source: rel.source,
    target: rel.target,
    sourceHandle: rel.sourceHandle,
    targetHandle: rel.targetHandle,
    type: 'smoothstep',
    animated: true,
    label: rel.label,
    style: { stroke: '#3b82f6' },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
    data: { relationType: rel.relationType }
  }));
}

export const DBStudio: React.FC<DBStudioProps> = ({ files, setFiles }) => {
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState(10);
  const [showSettings, setShowSettings] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Show toast notification
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Store loaded positions for initial render
  const [loadedPositions, setLoadedPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Load existing schema and relations from files on mount
  useEffect(() => {
    const schemaFile = files['db/schema.sql'];
    const relationsFile = files['db/relations.json'];

    if (schemaFile && tables.length === 0) {
      const { tables: parsedTables, relationships } = parseSQLToSchema(schemaFile);
      if (parsedTables.length > 0) {
        setTables(parsedTables);

        // Try to load relations.json first (has positions + edges)
        if (relationsFile) {
          const relationsData = parseRelationsJson(relationsFile);
          if (relationsData) {
            setLoadedPositions(relationsData.positions);
            setEdges(relationsToEdges(relationsData));
            showToast(`Loaded ${parsedTables.length} tables with ${relationsData.edges.length} relations`);
            return;
          }
        }

        // Fallback: Create edges from SQL relationships
        const newEdges: Edge[] = relationships.map((rel, i) => {
          const [fromTable, fromCol] = rel.from.split('.');
          const [toTable, toCol] = rel.to.split('.');
          return {
            id: `edge-${i}`,
            source: fromTable,
            sourceHandle: `${fromTable}-${fromCol}-source`,
            target: toTable,
            targetHandle: `${toTable}-${toCol}-target`,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#3b82f6' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
          };
        });
        setEdges(newEdges);
        showToast(`Loaded ${parsedTables.length} tables from schema.sql`);
      }
    }
  }, [files]);

  // Sync tables to nodes
  useEffect(() => {
    const newNodes: Node[] = tables.map((table, index) => {
      // Priority: 1. Current position, 2. Loaded position, 3. Default grid
      const existingNode = nodes.find(n => n.id === table.name);
      const savedPosition = loadedPositions[table.name];
      const defaultPosition = { x: 50 + (index % 3) * 300, y: 50 + Math.floor(index / 3) * 350 };

      return {
        id: table.name,
        type: 'table',
        position: existingNode?.position || savedPosition || defaultPosition,
        data: {
          table,
          onUpdate: (updated: TableSchema) => {
            setTables(prev => prev.map(t => t.name === table.name ? updated : t));
            setHasUnsavedChanges(true);
          },
          onDelete: () => {
            setTables(prev => prev.filter(t => t.name !== table.name));
            setEdges(prev => prev.filter(e => e.source !== table.name && e.target !== table.name));
            setHasUnsavedChanges(true);
          }
        }
      };
    });
    setNodes(newNodes);
  }, [tables, loadedPositions]);

  // Wrap onNodesChange to track position changes
  const handleNodesChange = useCallback((changes: any[]) => {
    onNodesChange(changes);
    // Check if any position changed
    const hasPositionChange = changes.some(c => c.type === 'position' && c.dragging === false);
    if (hasPositionChange) {
      setHasUnsavedChanges(true);
    }
  }, [onNodesChange]);

  // Wrap onEdgesChange to track edge deletions
  const handleEdgesChange = useCallback((changes: any[]) => {
    onEdgesChange(changes);
    const hasEdgeChange = changes.some(c => c.type === 'remove');
    if (hasEdgeChange) {
      setHasUnsavedChanges(true);
    }
  }, [onEdgesChange]);

  const onConnect = useCallback((params: Connection) => {
    const newEdge: Edge = {
      id: `edge-${Date.now()}`,
      source: params.source || '',
      target: params.target || '',
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: 'smoothstep',
      animated: true,
      style: { stroke: '#3b82f6' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
    };
    setEdges(eds => addEdge(newEdge, eds));
    setHasUnsavedChanges(true);
  }, [setEdges]);

  const addTable = () => {
    const existingNames = tables.map(t => t.name);
    let newName = 'new_table';
    let counter = 1;
    while (existingNames.includes(newName)) {
      newName = `new_table_${counter++}`;
    }

    const newTable: TableSchema = {
      name: newName,
      columns: [
        { name: 'id', type: 'SERIAL', isPrimaryKey: true },
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' }
      ]
    };
    setTables([...tables, newTable]);
    setHasUnsavedChanges(true);
  };

  const generateWithAI = async (extend: boolean = false) => {
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);

    try {
      const providerManager = getProviderManager();

      let prompt = '';
      if (extend && tables.length > 0) {
        const existingSchema = tables.map(t => `${t.name}: ${t.columns.map(c => c.name).join(', ')}`).join('\n');
        prompt = `I have an existing database schema:
${existingSchema}

Now I want to: "${aiPrompt}"

Generate ADDITIONAL tables/modifications as JSON. Keep existing tables and add new ones or modify as needed.`;
      } else {
        prompt = `Generate a database schema as JSON for: "${aiPrompt}"`;
      }

      const fullPrompt = `${prompt}

Return ONLY valid JSON in this exact format:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        { "name": "id", "type": "SERIAL", "isPrimaryKey": true },
        { "name": "column_name", "type": "VARCHAR(255)" }
      ]
    }
  ],
  "relationships": [
    { "from": "table1.column", "to": "table2.column" }
  ]
}

Use appropriate SQL types: INT, BIGINT, SERIAL, VARCHAR(255), TEXT, BOOLEAN, DATE, DATETIME, TIMESTAMP, DECIMAL(10,2), FLOAT, JSON, UUID`;

      // Don't pass selectedModel - use provider's default model from settings
      const response = await providerManager.generate({
        prompt: fullPrompt,
        responseFormat: 'json',
        responseSchema: DATABASE_SCHEMA_SCHEMA,
        debugCategory: 'other',
      });

      const text = response.text || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const schema = JSON.parse(jsonMatch[0]);
        if (schema.tables) {
          if (extend) {
            // Merge with existing tables
            const existingNames = new Set(tables.map(t => t.name));
            const newTables = schema.tables.filter((t: TableSchema) => !existingNames.has(t.name));
            setTables([...tables, ...newTables]);
          } else {
            setTables(schema.tables);
          }

          if (schema.relationships) {
            const newEdges: Edge[] = schema.relationships.map((rel: { from: string; to: string }, i: number) => {
              const [fromTable, fromCol] = rel.from.split('.');
              const [toTable, toCol] = rel.to.split('.');
              return {
                id: `edge-${Date.now()}-${i}`,
                source: fromTable,
                sourceHandle: `${fromTable}-${fromCol}-source`,
                target: toTable,
                targetHandle: `${toTable}-${toCol}-target`,
                type: 'smoothstep',
                animated: true,
                style: { stroke: '#3b82f6' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
              };
            });
            setEdges(prev => extend ? [...prev, ...newEdges] : newEdges);
          }

          setHasUnsavedChanges(true);
          showToast(`Generated ${schema.tables.length} tables`);
        }
      }
    } catch (error) {
      console.error('AI generation failed:', error);
      showToast('AI generation failed');
    } finally {
      setIsGenerating(false);
      setShowAiPanel(false);
      setAiPrompt('');
    }
  };

  const saveToFiles = () => {
    const sql = generateSQL(tables, edges);
    const relations = generateRelationsJson(nodes, edges);
    const newFiles = { ...files, 'db/schema.sql': sql, 'db/relations.json': relations };

    // Also update seed.sql if it exists
    if (files['db/seed.sql']) {
      const seedSql = generateFakeData(tables, rowCount);
      newFiles['db/seed.sql'] = seedSql;
    }

    setFiles(newFiles);
    setHasUnsavedChanges(false);
    showToast('Saved schema + relations');
  };

  const exportWithData = () => {
    const schema = generateSQL(tables, edges);
    const relations = generateRelationsJson(nodes, edges);
    const data = generateFakeData(tables, rowCount);
    setFiles({
      ...files,
      'db/schema.sql': schema,
      'db/relations.json': relations,
      'db/seed.sql': data
    });
    setHasUnsavedChanges(false);
    showToast(`Exported schema + relations + ${rowCount * tables.length} rows of seed data`);
  };

  const copySQL = async () => {
    const sql = generateSQL(tables, edges);
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('SQL copied to clipboard');
  };

  const refreshFromFile = () => {
    const schemaFile = files['db/schema.sql'];
    const relationsFile = files['db/relations.json'];

    if (schemaFile) {
      const { tables: parsedTables, relationships } = parseSQLToSchema(schemaFile);
      setTables(parsedTables);

      // Try to load from relations.json first
      if (relationsFile) {
        const relationsData = parseRelationsJson(relationsFile);
        if (relationsData) {
          setLoadedPositions(relationsData.positions);
          setEdges(relationsToEdges(relationsData));
          setHasUnsavedChanges(false);
          showToast(`Reloaded ${parsedTables.length} tables with ${relationsData.edges.length} relations`);
          return;
        }
      }

      // Fallback to SQL relationships
      const newEdges: Edge[] = relationships.map((rel, i) => {
        const [fromTable, fromCol] = rel.from.split('.');
        const [toTable, toCol] = rel.to.split('.');
        return {
          id: `edge-${i}`,
          source: fromTable,
          sourceHandle: `${fromTable}-${fromCol}-source`,
          target: toTable,
          targetHandle: `${toTable}-${toCol}-target`,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#3b82f6' },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' }
        };
      });
      setEdges(newEdges);
      setHasUnsavedChanges(false);
      showToast('Reloaded from schema.sql');
    } else {
      showToast('No schema.sql file found');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 relative">
      {/* Toast */}
      {toast && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg shadow-lg text-sm text-white animate-in fade-in slide-in-from-top-2">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a0e16] border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-semibold text-white">DB Studio</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded">
            {tables.length} tables
          </span>
          {hasUnsavedChanges && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded animate-pulse">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Settings dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              <ChevronDown className="w-3 h-3" />
            </button>
            {showSettings && (
              <div className="absolute right-0 mt-1 w-48 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 p-3">
                <label className="text-[10px] text-slate-500 uppercase">Seed Rows</label>
                <input
                  type="number"
                  value={rowCount}
                  onChange={(e) => setRowCount(Math.max(1, parseInt(e.target.value) || 10))}
                  className="w-full mt-1 px-2 py-1 bg-slate-900 border border-white/10 rounded text-sm text-white outline-none"
                  min="1"
                  max="1000"
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setShowAiPanel(!showAiPanel)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              showAiPanel ? 'bg-purple-500/20 text-purple-400' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            AI
          </button>
          <button
            onClick={addTable}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Table
          </button>
          <button
            onClick={refreshFromFile}
            className="p-1.5 text-xs bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Reload from file"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={copySQL}
            className="p-1.5 text-xs bg-white/5 text-slate-400 hover:text-white rounded-lg transition-colors"
            title="Copy SQL"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={saveToFiles}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              hasUnsavedChanges
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
            title="Save to schema.sql"
          >
            <Save className="w-3.5 h-3.5" />
            Save
          </button>
          <button
            onClick={exportWithData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
            title={`Export with ${rowCount} rows per table`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            + Seed
          </button>
        </div>
      </div>

      {/* AI Panel */}
      {showAiPanel && (
        <div className="px-4 py-3 bg-purple-500/10 border-b border-purple-500/20">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
            <input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && generateWithAI(tables.length > 0)}
              placeholder={tables.length > 0
                ? "Extend schema... (e.g., 'add reviews table with ratings')"
                : "Describe your schema... (e.g., 'E-commerce with users, products, orders')"
              }
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-purple-500/50"
              disabled={isGenerating}
            />
            <button
              onClick={() => generateWithAI(false)}
              disabled={isGenerating || !aiPrompt.trim()}
              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              title="Generate new schema"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              New
            </button>
            {tables.length > 0 && (
              <button
                onClick={() => generateWithAI(true)}
                disabled={isGenerating || !aiPrompt.trim()}
                className="px-3 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                title="Extend existing schema"
              >
                {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Extend
              </button>
            )}
          </div>
        </div>
      )}

      {/* React Flow Canvas */}
      <div className="flex-1">
        {tables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Database className="w-16 h-16 mb-4 opacity-30" />
            <h3 className="text-lg font-medium text-slate-400 mb-2">No tables yet</h3>
            <p className="text-sm mb-4 text-center max-w-md">
              {files['db/schema.sql']
                ? 'Schema file exists but no tables could be parsed. Try refreshing or create new tables.'
                : 'Create a table manually or use AI to generate a complete schema.'
              }
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={addTable}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Table
              </button>
              <button
                onClick={() => setShowAiPanel(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
              >
                <Wand2 className="w-4 h-4" />
                AI Generate
              </button>
              {files['db/schema.sql'] && (
                <button
                  onClick={refreshFromFile}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Reload File
                </button>
              )}
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-slate-950"
          >
            <Background color="#334155" gap={16} />
            <Controls className="!bg-slate-800 !border-slate-700 !rounded-lg [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!text-slate-400 [&>button:hover]:!bg-slate-700" />
            <MiniMap
              className="!bg-slate-800 !rounded-lg"
              nodeColor="#10b981"
              maskColor="rgba(0,0,0,0.5)"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
};
