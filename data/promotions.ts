/**
 * Promotional Content for Loading Screen
 *
 * Displayed during code generation to keep users engaged.
 */

export interface Promotion {
  id: string;
  type: 'feature' | 'tip' | 'creator' | 'ad';
  title: string;
  description: string;
  icon?: string; // Lucide icon name
  link?: string;
  linkText?: string;
}

// FluidFlow Features
export const FEATURES: Promotion[] = [
  {
    id: 'sketch-to-code',
    type: 'feature',
    title: 'Sketch to Code',
    description: 'Upload any wireframe or sketch and watch it transform into production-ready React code.',
    icon: 'Wand2',
  },
  {
    id: 'multi-provider',
    type: 'feature',
    title: 'Multi-Provider AI',
    description: 'Switch between Gemini, GPT-4, Claude, and more. Use the best model for each task.',
    icon: 'Bot',
  },
  {
    id: 'live-preview',
    type: 'feature',
    title: 'Live Preview',
    description: 'See your changes instantly with hot reload. Test on desktop, tablet, and mobile.',
    icon: 'Eye',
  },
  {
    id: 'git-integration',
    type: 'feature',
    title: 'Built-in Git',
    description: 'Version control your prototypes. Commit, branch, and push to GitHub without leaving the app.',
    icon: 'GitBranch',
  },
  {
    id: 'inspect-mode',
    type: 'feature',
    title: 'Visual Inspect',
    description: 'Click any element to edit it with AI. Describe changes in natural language.',
    icon: 'MousePointer2',
  },
  {
    id: 'context-aware',
    type: 'feature',
    title: 'Smart Context',
    description: 'AI remembers your conversation and codebase. Make iterative improvements effortlessly.',
    icon: 'Brain',
  },
  {
    id: 'auto-fix',
    type: 'feature',
    title: 'Auto Error Fix',
    description: 'Detected an error? AI automatically analyzes and fixes it for you.',
    icon: 'Wrench',
  },
  {
    id: 'responsive',
    type: 'feature',
    title: 'Responsive First',
    description: 'Every generated component is mobile-friendly by default with Tailwind CSS.',
    icon: 'Smartphone',
  },
];

// Pro Tips
export const TIPS: Promotion[] = [
  {
    id: 'tip-specific',
    type: 'tip',
    title: 'Be Specific',
    description: 'The more details you provide, the better the result. Mention colors, spacing, and behavior.',
    icon: 'Lightbulb',
  },
  {
    id: 'tip-iterate',
    type: 'tip',
    title: 'Iterate Quickly',
    description: 'Start with a basic layout, then refine with follow-up prompts. Small steps work best.',
    icon: 'RefreshCw',
  },
  {
    id: 'tip-inspect',
    type: 'tip',
    title: 'Use Inspect Mode',
    description: 'Click the target icon to visually select and edit any component on the preview.',
    icon: 'Target',
  },
  {
    id: 'tip-context',
    type: 'tip',
    title: 'Context Matters',
    description: 'AI remembers your conversation. Reference previous changes like "make that button bigger".',
    icon: 'MessageSquare',
  },
];

// Creator Info
export const CREATOR: Promotion = {
  id: 'creator',
  type: 'creator',
  title: 'Made with love',
  description: 'FluidFlow is crafted by passionate developers who believe in the power of AI-assisted development.',
  icon: 'Heart',
  link: 'https://github.com/ersinkoc/FluidFlow',
  linkText: 'Star on GitHub',
};

// Ads (can be loaded from external JSON)
export const DEFAULT_ADS: Promotion[] = [
  {
    id: 'ad-placeholder',
    type: 'ad',
    title: 'Your Ad Here',
    description: 'Reach developers building the future. Contact us for sponsorship.',
    icon: 'Megaphone',
  },
];

/**
 * Get a random promotion from all categories
 */
export function getRandomPromotion(): Promotion {
  const all = [...FEATURES, ...TIPS];
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Get promotions in a specific order for cycling
 */
export function getPromotionCycle(): Promotion[] {
  // Mix features and tips, add creator occasionally
  const cycle: Promotion[] = [];

  // Shuffle features
  const shuffledFeatures = [...FEATURES].sort(() => Math.random() - 0.5);
  const shuffledTips = [...TIPS].sort(() => Math.random() - 0.5);

  // Interleave: 2 features, 1 tip, repeat
  let fi = 0, ti = 0;
  while (fi < shuffledFeatures.length || ti < shuffledTips.length) {
    if (fi < shuffledFeatures.length) cycle.push(shuffledFeatures[fi++]);
    if (fi < shuffledFeatures.length) cycle.push(shuffledFeatures[fi++]);
    if (ti < shuffledTips.length) cycle.push(shuffledTips[ti++]);
  }

  // Add creator at the end
  cycle.push(CREATOR);

  return cycle;
}
