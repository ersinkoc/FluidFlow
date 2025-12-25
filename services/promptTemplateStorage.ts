/**
 * Prompt Template Storage Service
 *
 * Manages user's custom prompt templates with localStorage persistence
 * Templates can include variables like {{variableName}} for dynamic substitution
 */

export type PromptTemplateCategory = 'generation' | 'edit' | 'fix' | 'chat' | 'custom';

export interface PromptTemplateVariable {
  name: string;
  description?: string;
  defaultValue?: string;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptTemplateCategory;
  prompt: string;
  variables: PromptTemplateVariable[];
  tags: string[];
  isFavorite: boolean;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

export interface PromptTemplateStats {
  totalTemplates: number;
  favoriteCount: number;
  byCategory: Record<PromptTemplateCategory, number>;
  mostUsed: PromptTemplate[];
}

const STORAGE_KEY = 'fluidflow_prompt_templates';
const MAX_TEMPLATES = 100;

// Built-in default templates
const DEFAULT_TEMPLATES: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>[] = [
  {
    name: 'Add New Component',
    description: 'Create a new React component with specified features',
    category: 'generation',
    prompt: 'Create a {{componentName}} component that {{functionality}}. Use Tailwind CSS for styling and include hover states and transitions.',
    variables: [
      { name: 'componentName', description: 'Name of the component', defaultValue: 'Card' },
      { name: 'functionality', description: 'What the component should do', defaultValue: 'displays product information' },
    ],
    tags: ['component', 'react'],
    isFavorite: false,
    isBuiltIn: true,
  },
  {
    name: 'Add Feature to Page',
    description: 'Add a new feature or section to an existing page',
    category: 'edit',
    prompt: 'Add a {{featureName}} section to the {{pageName}}. It should {{requirements}}. Match the existing design style.',
    variables: [
      { name: 'featureName', description: 'Feature to add', defaultValue: 'testimonials' },
      { name: 'pageName', description: 'Target page', defaultValue: 'landing page' },
      { name: 'requirements', description: 'Feature requirements', defaultValue: 'show 3 customer reviews with avatar, name, and quote' },
    ],
    tags: ['feature', 'enhancement'],
    isFavorite: false,
    isBuiltIn: true,
  },
  {
    name: 'Fix Styling Issue',
    description: 'Fix CSS/Tailwind styling problems',
    category: 'fix',
    prompt: 'Fix the styling issue in {{componentName}}: {{issue}}. Ensure it looks correct on all screen sizes.',
    variables: [
      { name: 'componentName', description: 'Component with issue', defaultValue: 'Header' },
      { name: 'issue', description: 'Describe the problem', defaultValue: 'elements are not aligned properly on mobile' },
    ],
    tags: ['fix', 'styling', 'responsive'],
    isFavorite: false,
    isBuiltIn: true,
  },
  {
    name: 'Add Form Validation',
    description: 'Add client-side validation to a form',
    category: 'edit',
    prompt: 'Add form validation to {{formName}} with the following rules: {{validationRules}}. Show inline error messages and disable submit until valid.',
    variables: [
      { name: 'formName', description: 'Form to validate', defaultValue: 'contact form' },
      { name: 'validationRules', description: 'Validation requirements', defaultValue: 'email must be valid, name required, message min 10 chars' },
    ],
    tags: ['form', 'validation'],
    isFavorite: false,
    isBuiltIn: true,
  },
  {
    name: 'Create Dashboard Widget',
    description: 'Add a metric/stat widget to a dashboard',
    category: 'generation',
    prompt: 'Create a dashboard widget that displays {{metricType}}. Include {{features}}. Use appropriate icons from lucide-react.',
    variables: [
      { name: 'metricType', description: 'What metric to show', defaultValue: 'total revenue with percentage change' },
      { name: 'features', description: 'Widget features', defaultValue: 'trend arrow, sparkline chart, and comparison to last period' },
    ],
    tags: ['dashboard', 'widget', 'analytics'],
    isFavorite: false,
    isBuiltIn: true,
  },
];

/**
 * Initialize default templates if none exist
 */
function initializeDefaultTemplates(): PromptTemplate[] {
  const now = Date.now();
  return DEFAULT_TEMPLATES.map((template, index) => ({
    ...template,
    id: `builtin-${index + 1}`,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  }));
}

/**
 * Get all prompt templates from localStorage
 */
export function getPromptTemplates(): PromptTemplate[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      // First time - initialize with defaults
      const defaults = initializeDefaultTemplates();
      savePromptTemplates(defaults);
      return defaults;
    }
    return JSON.parse(data);
  } catch {
    return initializeDefaultTemplates();
  }
}

/**
 * Save prompt templates to localStorage
 */
function savePromptTemplates(templates: PromptTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (error) {
    console.error('Failed to save prompt templates:', error);
  }
}

/**
 * Get a single template by ID
 */
export function getPromptTemplateById(id: string): PromptTemplate | undefined {
  return getPromptTemplates().find(t => t.id === id);
}

/**
 * Add a new prompt template
 */
export function addPromptTemplate(
  template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'isBuiltIn'>
): PromptTemplate {
  const templates = getPromptTemplates();

  if (templates.length >= MAX_TEMPLATES) {
    throw new Error(`Maximum ${MAX_TEMPLATES} templates allowed`);
  }

  const now = Date.now();
  const newTemplate: PromptTemplate = {
    ...template,
    id: `template-${now}-${Math.random().toString(36).substring(2, 9)}`,
    isBuiltIn: false,
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };

  templates.unshift(newTemplate);
  savePromptTemplates(templates);
  return newTemplate;
}

/**
 * Update an existing prompt template
 */
export function updatePromptTemplate(
  id: string,
  updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt' | 'isBuiltIn'>>
): boolean {
  const templates = getPromptTemplates();
  const index = templates.findIndex(t => t.id === id);

  if (index === -1) return false;

  // Don't allow editing built-in template content, only favorites
  if (templates[index].isBuiltIn && Object.keys(updates).some(k => k !== 'isFavorite')) {
    return false;
  }

  templates[index] = {
    ...templates[index],
    ...updates,
    updatedAt: Date.now(),
  };

  savePromptTemplates(templates);
  return true;
}

/**
 * Delete a prompt template
 */
export function deletePromptTemplate(id: string): boolean {
  const templates = getPromptTemplates();
  const template = templates.find(t => t.id === id);

  // Can't delete built-in templates
  if (template?.isBuiltIn) return false;

  const filtered = templates.filter(t => t.id !== id);
  if (filtered.length === templates.length) return false;

  savePromptTemplates(filtered);
  return true;
}

/**
 * Toggle favorite status
 */
export function toggleTemplateFavorite(id: string): boolean | null {
  const templates = getPromptTemplates();
  const template = templates.find(t => t.id === id);

  if (!template) return null;

  template.isFavorite = !template.isFavorite;
  template.updatedAt = Date.now();
  savePromptTemplates(templates);
  return template.isFavorite;
}

/**
 * Increment usage count for a template
 */
export function incrementTemplateUsage(id: string): void {
  const templates = getPromptTemplates();
  const template = templates.find(t => t.id === id);

  if (template) {
    template.usageCount++;
    template.updatedAt = Date.now();
    savePromptTemplates(templates);
  }
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: PromptTemplateCategory): PromptTemplate[] {
  return getPromptTemplates().filter(t => t.category === category);
}

/**
 * Get favorite templates
 */
export function getFavoriteTemplates(): PromptTemplate[] {
  return getPromptTemplates().filter(t => t.isFavorite);
}

/**
 * Search templates by name, description, or tags
 */
export function searchPromptTemplates(query: string): PromptTemplate[] {
  const templates = getPromptTemplates();
  const lowerQuery = query.toLowerCase();

  return templates.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * Get template statistics
 */
export function getPromptTemplateStats(): PromptTemplateStats {
  const templates = getPromptTemplates();

  const byCategory: Record<PromptTemplateCategory, number> = {
    generation: 0,
    edit: 0,
    fix: 0,
    chat: 0,
    custom: 0,
  };

  for (const t of templates) {
    byCategory[t.category]++;
  }

  const mostUsed = [...templates].sort((a, b) => b.usageCount - a.usageCount).slice(0, 5);

  return {
    totalTemplates: templates.length,
    favoriteCount: templates.filter(t => t.isFavorite).length,
    byCategory,
    mostUsed,
  };
}

/**
 * Extract variables from a prompt string
 * Matches {{variableName}} pattern
 */
export function extractVariablesFromPrompt(prompt: string): string[] {
  const matches = prompt.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
}

/**
 * Apply variables to a prompt template
 */
export function applyVariablesToPrompt(
  prompt: string,
  values: Record<string, string>
): string {
  let result = prompt;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Duplicate a template (for creating variations)
 */
export function duplicateTemplate(id: string): PromptTemplate | null {
  const original = getPromptTemplateById(id);
  if (!original) return null;

  return addPromptTemplate({
    name: `${original.name} (Copy)`,
    description: original.description,
    category: original.category,
    prompt: original.prompt,
    variables: [...original.variables],
    tags: [...original.tags],
    isFavorite: false,
  });
}

/**
 * Export templates as JSON
 */
export function exportPromptTemplates(): string {
  const templates = getPromptTemplates().filter(t => !t.isBuiltIn);
  return JSON.stringify(templates, null, 2);
}

/**
 * Import templates from JSON
 */
export function importPromptTemplates(
  json: string
): { success: boolean; imported: number; error?: string } {
  try {
    const imported = JSON.parse(json) as PromptTemplate[];

    if (!Array.isArray(imported)) {
      return { success: false, imported: 0, error: 'Invalid format: expected array' };
    }

    const validItems = imported.filter(
      item => item.name && item.prompt && typeof item.prompt === 'string'
    );

    if (validItems.length === 0) {
      return { success: false, imported: 0, error: 'No valid templates found' };
    }

    const currentTemplates = getPromptTemplates();
    let addedCount = 0;
    const now = Date.now();

    for (const item of validItems) {
      if (currentTemplates.length >= MAX_TEMPLATES) break;

      const newTemplate: PromptTemplate = {
        ...item,
        id: `template-${now}-${Math.random().toString(36).substring(2, 9)}-${addedCount}`,
        isBuiltIn: false,
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        isFavorite: false,
      };
      currentTemplates.unshift(newTemplate);
      addedCount++;
    }

    savePromptTemplates(currentTemplates);
    return { success: true, imported: addedCount };
  } catch (error) {
    return {
      success: false,
      imported: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Reset to default templates (removes all custom templates)
 */
export function resetToDefaultTemplates(): void {
  const defaults = initializeDefaultTemplates();
  savePromptTemplates(defaults);
}

/**
 * Clear all templates (including built-in)
 */
export function clearAllTemplates(): void {
  localStorage.removeItem(STORAGE_KEY);
}
