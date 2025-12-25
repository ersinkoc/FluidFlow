/**
 * Project API
 *
 * API client for project CRUD operations.
 */

import { apiCall } from './client';
import type { Project, ProjectMeta, ProjectUpdateResponse, ProjectContext } from './types';

export const projectApi = {
  /**
   * List all projects
   */
  list: () => apiCall<ProjectMeta[]>('/projects'),

  /**
   * Get a single project with files
   */
  get: (id: string) => apiCall<Project>(`/projects/${id}`),

  /**
   * Create a new project
   */
  create: (data: { name?: string; description?: string; files?: Record<string, string> }) =>
    apiCall<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /**
   * Update a project (auto-save)
   * @param force - If true, bypass confirmation checks for large file reductions
   */
  update: (id: string, data: { name?: string; description?: string; files?: Record<string, string>; force?: boolean }) =>
    apiCall<ProjectUpdateResponse>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  /**
   * Delete a project
   */
  delete: (id: string) =>
    apiCall<{ message: string; id: string }>(`/projects/${id}`, {
      method: 'DELETE',
    }),

  /**
   * Duplicate a project
   */
  duplicate: (id: string, name?: string) =>
    apiCall<ProjectMeta>(`/projects/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  /**
   * Get project context (version history + UI state)
   */
  getContext: (id: string) =>
    apiCall<ProjectContext>(`/projects/${id}/context`),

  /**
   * Save project context
   */
  saveContext: (id: string, context: Partial<ProjectContext>) =>
    apiCall<{ message: string; savedAt: number }>(`/projects/${id}/context`, {
      method: 'PUT',
      body: JSON.stringify(context),
    }),

  /**
   * Clear project context
   */
  clearContext: (id: string) =>
    apiCall<{ message: string }>(`/projects/${id}/context`, {
      method: 'DELETE',
    }),

  /**
   * Delete node_modules for a project to free up disk space
   */
  cleanNodeModules: (id: string) =>
    apiCall<{ message: string; id: string; freedBytes: number; freedMB: number }>(`/projects/${id}/node_modules`, {
      method: 'DELETE',
    }),
};
