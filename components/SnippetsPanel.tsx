import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Search, Copy, Check, ChevronRight, Code2, Layout, Database, Zap, X, Sparkles, Plus, Trash2, Star } from 'lucide-react';
import { settingsApi } from '../services/projectApi';

interface Snippet {
  id: string;
  name: string;
  description: string;
  category: string;
  code: string;
  tags: string[];
  isCustom?: boolean;
}

interface SnippetsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (code: string) => void;
}

// Code snippets library
const SNIPPETS: Snippet[] = [
  // React Components
  {
    id: 'react-fc',
    name: 'Functional Component',
    description: 'Basic React functional component with TypeScript',
    category: 'React',
    tags: ['react', 'component', 'typescript'],
    code: `interface Props {
  // Add props here
}

export const ComponentName: React.FC<Props> = ({ }) => {
  return (
    <div>
      {/* Content here */}
    </div>
  );
};`
  },
  {
    id: 'react-state',
    name: 'useState Hook',
    description: 'React useState with TypeScript typing',
    category: 'React',
    tags: ['react', 'hooks', 'state'],
    code: `const [value, setValue] = useState<string>('');`
  },
  {
    id: 'react-effect',
    name: 'useEffect Hook',
    description: 'React useEffect with cleanup',
    category: 'React',
    tags: ['react', 'hooks', 'effect'],
    code: `useEffect(() => {
  // Effect logic here

  return () => {
    // Cleanup logic here
  };
}, [dependencies]);`
  },
  {
    id: 'react-memo',
    name: 'useMemo Hook',
    description: 'Memoized computed value',
    category: 'React',
    tags: ['react', 'hooks', 'performance'],
    code: `const memoizedValue = useMemo(() => {
  return computeExpensiveValue(a, b);
}, [a, b]);`
  },
  {
    id: 'react-callback',
    name: 'useCallback Hook',
    description: 'Memoized callback function',
    category: 'React',
    tags: ['react', 'hooks', 'performance'],
    code: `const memoizedCallback = useCallback(() => {
  doSomething(a, b);
}, [a, b]);`
  },
  {
    id: 'react-ref',
    name: 'useRef Hook',
    description: 'Ref for DOM elements or values',
    category: 'React',
    tags: ['react', 'hooks', 'ref'],
    code: `const ref = useRef<HTMLDivElement>(null);

// Usage: <div ref={ref}>...</div>`
  },
  {
    id: 'react-context',
    name: 'Context Provider',
    description: 'React context with provider pattern',
    category: 'React',
    tags: ['react', 'context', 'state'],
    code: `interface ContextType {
  value: string;
  setValue: (value: string) => void;
}

const MyContext = React.createContext<ContextType | null>(null);

export const MyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [value, setValue] = useState('');

  return (
    <MyContext.Provider value={{ value, setValue }}>
      {children}
    </MyContext.Provider>
  );
};

export const useMyContext = () => {
  const context = React.useContext(MyContext);
  if (!context) throw new Error('useMyContext must be used within MyProvider');
  return context;
};`
  },

  // Tailwind Layouts
  {
    id: 'tw-flex-center',
    name: 'Flex Center',
    description: 'Center content with flexbox',
    category: 'Tailwind',
    tags: ['tailwind', 'layout', 'flex'],
    code: `<div className="flex items-center justify-center">
  {/* Content */}
</div>`
  },
  {
    id: 'tw-flex-between',
    name: 'Flex Space Between',
    description: 'Space items evenly with flexbox',
    category: 'Tailwind',
    tags: ['tailwind', 'layout', 'flex'],
    code: `<div className="flex items-center justify-between">
  <div>Left</div>
  <div>Right</div>
</div>`
  },
  {
    id: 'tw-grid',
    name: 'Responsive Grid',
    description: 'Responsive grid layout',
    category: 'Tailwind',
    tags: ['tailwind', 'layout', 'grid'],
    code: `<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {items.map((item) => (
    <div key={item.id}>{/* Card */}</div>
  ))}
</div>`
  },
  {
    id: 'tw-card',
    name: 'Card Component',
    description: 'Styled card with shadow and rounded corners',
    category: 'Tailwind',
    tags: ['tailwind', 'component', 'card'],
    code: `<div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
  <h3 className="text-lg font-semibold text-gray-900">Title</h3>
  <p className="text-gray-600 mt-2">Description text here</p>
</div>`
  },
  {
    id: 'tw-button',
    name: 'Button Styles',
    description: 'Primary and secondary button styles',
    category: 'Tailwind',
    tags: ['tailwind', 'component', 'button'],
    code: `{/* Primary Button */}
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
  Primary
</button>

{/* Secondary Button */}
<button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium">
  Secondary
</button>

{/* Outline Button */}
<button className="px-4 py-2 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium">
  Outline
</button>`
  },
  {
    id: 'tw-input',
    name: 'Form Input',
    description: 'Styled form input with label',
    category: 'Tailwind',
    tags: ['tailwind', 'form', 'input'],
    code: `<div className="space-y-1">
  <label className="block text-sm font-medium text-gray-700">
    Email
  </label>
  <input
    type="email"
    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
    placeholder="you@example.com"
  />
</div>`
  },
  {
    id: 'tw-navbar',
    name: 'Navigation Bar',
    description: 'Responsive navigation bar',
    category: 'Tailwind',
    tags: ['tailwind', 'layout', 'navigation'],
    code: `<nav className="bg-white shadow-sm border-b">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex justify-between h-16">
      <div className="flex items-center">
        <span className="text-xl font-bold text-gray-900">Logo</span>
      </div>
      <div className="hidden md:flex items-center space-x-8">
        <a href="#" className="text-gray-600 hover:text-gray-900">Home</a>
        <a href="#" className="text-gray-600 hover:text-gray-900">About</a>
        <a href="#" className="text-gray-600 hover:text-gray-900">Contact</a>
      </div>
    </div>
  </div>
</nav>`
  },

  // Data Patterns
  {
    id: 'data-fetch',
    name: 'Data Fetching',
    description: 'Fetch data with loading and error states',
    category: 'Data',
    tags: ['fetch', 'async', 'loading'],
    code: `const [data, setData] = useState<DataType[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/data');
      if (!response.ok) throw new Error('Failed to fetch');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  fetchData();
}, []);`
  },
  {
    id: 'data-form',
    name: 'Form Handler',
    description: 'Form submission with validation',
    category: 'Data',
    tags: ['form', 'validation', 'submit'],
    code: `const [formData, setFormData] = useState({
  name: '',
  email: '',
});
const [errors, setErrors] = useState<Record<string, string>>({});
const [isSubmitting, setIsSubmitting] = useState(false);

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const { name, value } = e.target;
  setFormData(prev => ({ ...prev, [name]: value }));
  // Clear error when field is edited
  if (errors[name]) {
    setErrors(prev => ({ ...prev, [name]: '' }));
  }
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Validate
  const newErrors: Record<string, string> = {};
  if (!formData.name) newErrors.name = 'Name is required';
  if (!formData.email) newErrors.email = 'Email is required';

  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors);
    return;
  }

  setIsSubmitting(true);
  try {
    // Submit logic here
  } finally {
    setIsSubmitting(false);
  }
};`
  },
  {
    id: 'data-localstorage',
    name: 'LocalStorage Hook',
    description: 'Persist state to localStorage',
    category: 'Data',
    tags: ['storage', 'hooks', 'persist'],
    code: `function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue] as const;
}`
  },

  // Animation
  {
    id: 'anim-fade',
    name: 'Fade Animation',
    description: 'Fade in/out with Tailwind',
    category: 'Animation',
    tags: ['animation', 'tailwind', 'transition'],
    code: `{/* Add to your CSS or Tailwind config */}
// tailwind.config.js
// animation: {
//   'fade-in': 'fadeIn 0.3s ease-out',
//   'fade-out': 'fadeOut 0.3s ease-in',
// },
// keyframes: {
//   fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
//   fadeOut: { '0%': { opacity: '1' }, '100%': { opacity: '0' } },
// }

<div className={isVisible ? 'animate-fade-in' : 'animate-fade-out'}>
  Content
</div>`
  },
  {
    id: 'anim-slide',
    name: 'Slide Animation',
    description: 'Slide in from different directions',
    category: 'Animation',
    tags: ['animation', 'tailwind', 'transition'],
    code: `<div className="transform transition-all duration-300 ease-out
  translate-y-0 opacity-100
  group-hover:-translate-y-1 group-hover:opacity-90">
  Content slides up on hover
</div>

{/* Or with conditional */}
<div className={\`transform transition-all duration-300
  \${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'}\`}>
  Slide from left
</div>`
  },
];

const CATEGORIES = [
  { id: 'all', name: 'All', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'Custom', name: 'My Snippets', icon: <Star className="w-4 h-4" /> },
  { id: 'React', name: 'React', icon: <Code2 className="w-4 h-4" /> },
  { id: 'Tailwind', name: 'Tailwind', icon: <Layout className="w-4 h-4" /> },
  { id: 'Data', name: 'Data', icon: <Database className="w-4 h-4" /> },
  { id: 'Animation', name: 'Animation', icon: <Zap className="w-4 h-4" /> },
];

export const SnippetsPanel: React.FC<SnippetsPanelProps> = ({ isOpen, onClose, onInsert }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customSnippets, setCustomSnippets] = useState<Snippet[]>([]);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newSnippet, setNewSnippet] = useState({ name: '', code: '', category: 'Custom' });

  const loadCustomSnippets = useCallback(async () => {
    try {
      const snippets = await settingsApi.getSnippets();
      setCustomSnippets(snippets.map(s => ({
        id: s.id,
        name: s.name,
        description: `Custom snippet • ${new Date(s.createdAt).toLocaleDateString()}`,
        category: s.category || 'Custom',
        code: s.code,
        tags: ['custom'],
        isCustom: true,
      })));
    } catch (_e) {
      console.log('[Snippets] Backend not available, using local only');
    }
  }, []);

  // Load custom snippets from backend
  useEffect(() => {
    if (isOpen) {
      loadCustomSnippets();
    }
  }, [isOpen, loadCustomSnippets]);

  const handleAddSnippet = async () => {
    if (!newSnippet.name.trim() || !newSnippet.code.trim()) return;

    try {
      const created = await settingsApi.addSnippet({
        name: newSnippet.name,
        code: newSnippet.code,
        category: newSnippet.category,
      });

      setCustomSnippets(prev => [...prev, {
        id: created.id,
        name: created.name,
        description: `Custom snippet • ${new Date(created.createdAt).toLocaleDateString()}`,
        category: created.category,
        code: created.code,
        tags: ['custom'],
        isCustom: true,
      }]);

      setNewSnippet({ name: '', code: '', category: 'Custom' });
      setIsAddingNew(false);
    } catch (e) {
      console.error('[Snippets] Failed to add snippet:', e);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await settingsApi.deleteSnippet(id);
      setCustomSnippets(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error('[Snippets] Failed to delete snippet:', e);
    }
  };

  // Combine built-in and custom snippets
  const allSnippets = useMemo(() => {
    return [...customSnippets, ...SNIPPETS];
  }, [customSnippets]);

  const filteredSnippets = useMemo(() => {
    return allSnippets.filter(snippet => {
      const matchesCategory = category === 'all' || snippet.category === category;
      const matchesSearch = search === '' ||
        snippet.name.toLowerCase().includes(search.toLowerCase()) ||
        snippet.description.toLowerCase().includes(search.toLowerCase()) ||
        snippet.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [search, category, allSnippets]);

  const handleCopy = async (snippet: Snippet) => {
    await navigator.clipboard.writeText(snippet.code);
    setCopiedId(snippet.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleInsert = (snippet: Snippet) => {
    onInsert(snippet.code);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl h-[80vh] bg-slate-900 border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Code2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Code Snippets</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Snippet
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add New Snippet Form */}
        {isAddingNew && (
          <div className="px-4 py-3 border-b border-white/5 bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">New Custom Snippet</span>
              <button
                onClick={() => setIsAddingNew(false)}
                className="p-1 rounded hover:bg-white/10 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              value={newSnippet.name}
              onChange={e => setNewSnippet(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Snippet name..."
              className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
            />
            <textarea
              value={newSnippet.code}
              onChange={e => setNewSnippet(prev => ({ ...prev, code: e.target.value }))}
              placeholder="Paste your code here..."
              rows={5}
              className="w-full px-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 font-mono resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsAddingNew(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSnippet}
                disabled={!newSnippet.name.trim() || !newSnippet.code.trim()}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
              >
                Save Snippet
              </button>
            </div>
          </div>
        )}

        {/* Search & Filters */}
        <div className="px-4 py-3 border-b border-white/5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search snippets..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  category === cat.id
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {cat.icon}
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Snippets List */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
          {filteredSnippets.length === 0 ? (
            <div className="text-center text-slate-500 py-8">
              No snippets found
            </div>
          ) : (
            filteredSnippets.map(snippet => (
              <div
                key={snippet.id}
                className="bg-slate-800/50 border border-white/5 rounded-lg overflow-hidden"
              >
                {/* Snippet Header */}
                <button
                  onClick={() => setExpandedId(expandedId === snippet.id ? null : snippet.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-white">{snippet.name}</h3>
                      <p className="text-xs text-slate-500">{snippet.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {snippet.isCustom && (
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded ${
                      snippet.isCustom
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {snippet.category}
                    </span>
                    <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform ${
                      expandedId === snippet.id ? 'rotate-90' : ''
                    }`} />
                  </div>
                </button>

                {/* Expanded Code */}
                {expandedId === snippet.id && (
                  <div className="border-t border-white/5">
                    <pre className="p-4 text-xs text-slate-300 overflow-x-auto bg-slate-950/50">
                      <code>{snippet.code}</code>
                    </pre>
                    <div className="flex justify-between px-4 py-2 bg-slate-900/50 border-t border-white/5">
                      {/* Delete button for custom snippets */}
                      <div>
                        {snippet.isCustom && (
                          <button
                            onClick={() => handleDeleteSnippet(snippet.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleCopy(snippet)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                        >
                          {copiedId === snippet.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-green-400" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleInsert(snippet)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                          Insert
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/50">
          <p className="text-[10px] text-slate-600 text-center">
            {filteredSnippets.length} snippets available • Click to expand • Insert adds to current file
          </p>
        </div>
      </div>
    </div>
  );
};
