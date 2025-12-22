/**
 * Prompt Library
 * Centralized export of all prompt categories and utilities
 */

// Types
export type { PromptItem, PromptCategory, PromptLevel } from './types';
export { getPromptByLevel, getDefaultPrompt } from './types';

// Categories
import { designCategory } from './categories/design';
import { componentsCategory } from './categories/components';
import { responsiveCategory } from './categories/responsive';
import { uxCategory } from './categories/ux';
import { animationCategory } from './categories/animation';
import { accessibilityCategory } from './categories/accessibility';
import { contentCategory } from './categories/content';
import { featuresCategory } from './categories/features';
import { formsCategory } from './categories/forms';
import { dashboardCategory } from './categories/dashboard';
import { ecommerceCategory } from './categories/ecommerce';
import { socialCategory } from './categories/social';
import { layoutsCategory } from './categories/layouts';

// Quick prompts
import { quickPrompts } from './quickPrompts';

// Re-export individual categories for direct import
export {
  designCategory,
  componentsCategory,
  responsiveCategory,
  uxCategory,
  animationCategory,
  accessibilityCategory,
  contentCategory,
  featuresCategory,
  formsCategory,
  dashboardCategory,
  ecommerceCategory,
  socialCategory,
  layoutsCategory,
};

// Re-export quick prompts
export { quickPrompts };

// Combined library
import type { PromptCategory } from './types';

export const promptLibrary: PromptCategory[] = [
  designCategory,
  componentsCategory,
  responsiveCategory,
  uxCategory,
  animationCategory,
  accessibilityCategory,
  contentCategory,
  featuresCategory,
  formsCategory,
  dashboardCategory,
  ecommerceCategory,
  socialCategory,
  layoutsCategory,
];
