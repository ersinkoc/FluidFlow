/**
 * JSON Schemas for structured AI output.
 * Used with providers that support JSON Schema enforcement (Gemini, OpenAI, etc.)
 *
 * NOTE: OpenAI and Anthropic require `additionalProperties: false` on all objects.
 * Schemas with dynamic keys (like FILE_GENERATION_SCHEMA) can only use native
 * enforcement with Gemini. Other providers fall back to system prompt guidance.
 */

import type { ProviderType } from '../types';

/**
 * Schema for file generation responses.
 * Matches the format expected by parseMultiFileResponse().
 * Files are an object with paths as keys and content as values.
 *
 * NOTE: Uses additionalProperties for dynamic file paths.
 * Only Gemini supports this natively - other providers use prompt guidance.
 */
export const FILE_GENERATION_SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'object',
      additionalProperties: {
        type: 'string'
      },
      description: 'Object with file paths as keys and file content as values (e.g., {"src/App.tsx": "import React..."})'
    },
    explanation: {
      type: 'string',
      description: 'Brief explanation of changes made'
    },
    deletedFiles: {
      type: 'array',
      items: { type: 'string' },
      description: 'Array of file paths to delete'
    }
  },
  required: ['files']
} as const;

/**
 * Check if a provider supports schemas with dynamic keys (additionalProperties).
 * OpenAI and Anthropic require additionalProperties: false, so they can't
 * enforce schemas with dynamic keys natively.
 * Gemini requires non-empty `properties` even with additionalProperties, which
 * doesn't work for truly dynamic key schemas like FILE_GENERATION_SCHEMA.
 *
 * Currently NO providers fully support dynamic keys natively, so all fall back
 * to system prompt guidance for schemas with dynamic file paths.
 */
export function supportsAdditionalProperties(_providerType: ProviderType): boolean {
  // No provider fully supports additionalProperties for dynamic keys
  // Gemini requires non-empty `properties` which breaks dynamic key schemas
  // OpenAI/Anthropic require additionalProperties: false
  // All providers fall back to system prompt guidance for dynamic key schemas
  return false;
}

/**
 * Check if a schema has dynamic keys (uses additionalProperties for data).
 * Schemas with dynamic keys can't use native enforcement on any provider.
 */
export function schemaHasDynamicKeys(schema: Record<string, unknown>): boolean {
  // Check top-level additionalProperties
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    return true;
  }

  // Check nested properties
  const properties = schema.properties as Record<string, unknown> | undefined;
  if (properties) {
    for (const prop of Object.values(properties)) {
      if (typeof prop === 'object' && prop !== null) {
        const propObj = prop as Record<string, unknown>;
        // Object with additionalProperties (like files: { additionalProperties: { type: 'string' } })
        if (propObj.type === 'object' && propObj.additionalProperties && typeof propObj.additionalProperties === 'object') {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Check if native schema enforcement should be used.
 * Returns true for static schemas on providers that support them.
 * FILE_GENERATION_SCHEMA (dynamic keys) always returns false.
 * Other schemas (ACCESSIBILITY_AUDIT_SCHEMA, etc.) return true for compatible providers.
 */
export function supportsNativeSchema(providerType: ProviderType, schema?: Record<string, unknown>): boolean {
  // If no schema, nothing to enforce
  if (!schema) return false;

  // Dynamic key schemas can't use native enforcement on any provider
  if (schemaHasDynamicKeys(schema)) return false;

  // Static schemas work with these providers:
  // - Gemini: responseSchema
  // - OpenAI: json_schema response_format
  // - Anthropic: output_format with beta header
  // - OpenRouter: json_schema (routes to compatible models)
  return (
    providerType === 'gemini' ||
    providerType === 'openai' ||
    providerType === 'anthropic' ||
    providerType === 'openrouter'
  );
}

/**
 * Check if schema should be used natively or via system prompt.
 * Returns the schema if native enforcement is supported, null otherwise.
 */
export function getSchemaForProvider(
  schema: Record<string, unknown>,
  providerType: ProviderType,
  hasDynamicKeys: boolean = false
): Record<string, unknown> | null {
  // If schema has dynamic keys and provider doesn't support them, return null
  if (hasDynamicKeys && !supportsAdditionalProperties(providerType)) {
    return null;
  }
  return schema;
}

/**
 * Schema for component analysis responses.
 * Compatible with all providers (uses additionalProperties: false).
 */
export const COMPONENT_ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['functional', 'class', 'hoc', 'hook']
          },
          file: { type: 'string' },
          props: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean' }
              },
              required: ['name', 'type'],
              additionalProperties: false
            }
          },
          dependencies: {
            type: 'array',
            items: { type: 'string' }
          }
        },
        required: ['name', 'type', 'file'],
        additionalProperties: false
      }
    }
  },
  required: ['components'],
  additionalProperties: false
} as const;

/**
 * Schema for accessibility audit responses.
 * Matches the format used in PreviewPanel/index.tsx runAccessibilityAudit().
 * Compatible with all providers (uses additionalProperties: false).
 */
export const ACCESSIBILITY_AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    score: {
      type: 'number',
      description: 'Accessibility score from 0-100'
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['error', 'warning'],
            description: 'Issue severity'
          },
          message: {
            type: 'string',
            description: 'Description of the accessibility issue'
          }
        },
        required: ['type', 'message'],
        additionalProperties: false
      }
    }
  },
  required: ['score', 'issues'],
  additionalProperties: false
} as const;

/**
 * Schema for quick edit responses.
 * Compatible with all providers (uses additionalProperties: false).
 */
export const QUICK_EDIT_SCHEMA = {
  type: 'object',
  properties: {
    file: {
      type: 'string',
      description: 'File path that was edited'
    },
    content: {
      type: 'string',
      description: 'Updated file content'
    },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          description: { type: 'string' }
        },
        required: ['line', 'description'],
        additionalProperties: false
      },
      description: 'List of changes made'
    }
  },
  required: ['file', 'content'],
  additionalProperties: false
} as const;

/**
 * Schema for error fix responses.
 * Compatible with all providers (uses additionalProperties: false).
 */
export const ERROR_FIX_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: {
      type: 'string',
      description: 'Analysis of the error cause'
    },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      },
      description: 'Files to update to fix the error'
    },
    explanation: {
      type: 'string',
      description: 'Explanation of the fix'
    }
  },
  required: ['diagnosis', 'files'],
  additionalProperties: false
} as const;

/**
 * Schema for commit message generation.
 * Compatible with all providers (uses additionalProperties: false).
 */
export const COMMIT_MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['feat', 'fix', 'docs', 'style', 'refactor', 'test', 'chore'],
      description: 'Conventional commit type'
    },
    scope: {
      type: 'string',
      description: 'Optional scope of the change'
    },
    subject: {
      type: 'string',
      description: 'Short description (50 chars or less)'
    },
    body: {
      type: 'string',
      description: 'Detailed description of changes'
    }
  },
  required: ['type', 'subject'],
  additionalProperties: false
} as const;

/**
 * Schema for UX/design suggestions (Consultant mode).
 * Returns an array of suggestion strings.
 * Compatible with all providers (simple array schema).
 */
export const SUGGESTIONS_SCHEMA = {
  type: 'array',
  items: {
    type: 'string',
    description: 'A specific UX or design suggestion'
  },
  description: 'Array of UX/design suggestions'
} as const;

export type SuggestionsResponse = string[];

// Type exports for TypeScript type inference
export type FileGenerationResponse = {
  files: Record<string, string>;
  explanation?: string;
  deletedFiles?: string[];
};

export type QuickEditResponse = {
  file: string;
  content: string;
  changes?: Array<{
    line: number;
    description: string;
  }>;
};

export type ErrorFixResponse = {
  diagnosis: string;
  files: Array<{
    path: string;
    content: string;
  }>;
  explanation?: string;
};

/**
 * Schema for database schema generation (DBStudio).
 * Compatible with all providers (uses additionalProperties: false).
 */
export const DATABASE_SCHEMA_SCHEMA = {
  type: 'object',
  properties: {
    tables: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Table name' },
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Column name' },
                type: { type: 'string', description: 'SQL type (e.g., SERIAL, VARCHAR(255), INT)' },
                isPrimaryKey: { type: 'boolean', description: 'Whether this column is a primary key' },
                isNullable: { type: 'boolean', description: 'Whether this column allows NULL values' },
                defaultValue: { type: 'string', description: 'Default value for the column' },
                references: { type: 'string', description: 'Foreign key reference (e.g., "users.id")' }
              },
              required: ['name', 'type'],
              additionalProperties: false
            }
          }
        },
        required: ['name', 'columns'],
        additionalProperties: false
      }
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source table.column (e.g., "orders.user_id")' },
          to: { type: 'string', description: 'Target table.column (e.g., "users.id")' }
        },
        required: ['from', 'to'],
        additionalProperties: false
      },
      description: 'Foreign key relationships between tables'
    }
  },
  required: ['tables'],
  additionalProperties: false
} as const;

export type DatabaseSchemaResponse = {
  tables: Array<{
    name: string;
    columns: Array<{
      name: string;
      type: string;
      isPrimaryKey?: boolean;
      isNullable?: boolean;
      defaultValue?: string;
      references?: string;
    }>;
  }>;
  relationships?: Array<{
    from: string;
    to: string;
  }>;
};
