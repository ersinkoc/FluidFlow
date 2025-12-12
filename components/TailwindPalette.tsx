import React, { useState, useMemo } from 'react';
import { Search, Check, X, Palette, Layout, Type, Box, Move, Sparkles } from 'lucide-react';

interface TailwindPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (className: string) => void;
}

// Tailwind color palette
const COLORS = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose'
];

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

// Common Tailwind utility categories
const UTILITY_CATEGORIES = {
  spacing: {
    name: 'Spacing',
    icon: <Move className="w-4 h-4" />,
    items: [
      { label: 'Padding', classes: ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-10', 'p-12', 'px-4', 'py-2', 'px-6 py-3'] },
      { label: 'Margin', classes: ['m-0', 'm-1', 'm-2', 'm-4', 'm-auto', 'mx-auto', 'my-4', 'mt-4', 'mb-4', 'ml-4', 'mr-4'] },
      { label: 'Gap', classes: ['gap-1', 'gap-2', 'gap-3', 'gap-4', 'gap-6', 'gap-8'] },
    ]
  },
  layout: {
    name: 'Layout',
    icon: <Layout className="w-4 h-4" />,
    items: [
      { label: 'Display', classes: ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'hidden'] },
      { label: 'Flex', classes: ['flex-row', 'flex-col', 'flex-wrap', 'flex-1', 'flex-none', 'flex-grow', 'flex-shrink-0'] },
      { label: 'Justify', classes: ['justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly'] },
      { label: 'Align', classes: ['items-start', 'items-center', 'items-end', 'items-stretch', 'items-baseline'] },
      { label: 'Grid', classes: ['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-12', 'col-span-2', 'col-span-3'] },
    ]
  },
  sizing: {
    name: 'Sizing',
    icon: <Box className="w-4 h-4" />,
    items: [
      { label: 'Width', classes: ['w-full', 'w-screen', 'w-auto', 'w-1/2', 'w-1/3', 'w-1/4', 'w-64', 'w-96', 'max-w-sm', 'max-w-md', 'max-w-lg', 'max-w-xl'] },
      { label: 'Height', classes: ['h-full', 'h-screen', 'h-auto', 'h-64', 'h-96', 'min-h-screen', 'min-h-full'] },
    ]
  },
  typography: {
    name: 'Typography',
    icon: <Type className="w-4 h-4" />,
    items: [
      { label: 'Size', classes: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl'] },
      { label: 'Weight', classes: ['font-thin', 'font-light', 'font-normal', 'font-medium', 'font-semibold', 'font-bold', 'font-extrabold'] },
      { label: 'Align', classes: ['text-left', 'text-center', 'text-right', 'text-justify'] },
      { label: 'Style', classes: ['italic', 'not-italic', 'uppercase', 'lowercase', 'capitalize', 'truncate', 'line-clamp-2'] },
    ]
  },
  effects: {
    name: 'Effects',
    icon: <Sparkles className="w-4 h-4" />,
    items: [
      { label: 'Shadow', classes: ['shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl', 'shadow-none'] },
      { label: 'Rounded', classes: ['rounded-none', 'rounded-sm', 'rounded', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full'] },
      { label: 'Opacity', classes: ['opacity-0', 'opacity-25', 'opacity-50', 'opacity-75', 'opacity-100'] },
      { label: 'Transition', classes: ['transition', 'transition-all', 'transition-colors', 'transition-transform', 'duration-150', 'duration-300', 'ease-in-out'] },
    ]
  },
};

// Get actual color value for preview
const getColorValue = (color: string, shade: string): string => {
  const colorMap: Record<string, Record<string, string>> = {
    slate: { '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a', '950': '#020617' },
    gray: { '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db', '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151', '800': '#1f2937', '900': '#111827', '950': '#030712' },
    red: { '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5', '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a' },
    orange: { '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74', '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c', '800': '#9a3412', '900': '#7c2d12', '950': '#431407' },
    yellow: { '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047', '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207', '800': '#854d0e', '900': '#713f12', '950': '#422006' },
    green: { '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac', '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d', '950': '#052e16' },
    blue: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a', '950': '#172554' },
    indigo: { '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc', '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca', '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b' },
    purple: { '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe', '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce', '800': '#6b21a8', '900': '#581c87', '950': '#3b0764' },
    pink: { '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4', '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d', '800': '#9d174d', '900': '#831843', '950': '#500724' },
  };
  return colorMap[color]?.[shade] || '#000000';
};

export const TailwindPalette: React.FC<TailwindPaletteProps> = ({ isOpen, onClose, onInsert }) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'colors' | 'utilities'>('colors');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [copiedClass, setCopiedClass] = useState<string | null>(null);

  const handleCopy = async (className: string) => {
    await navigator.clipboard.writeText(className);
    setCopiedClass(className);
    setTimeout(() => setCopiedClass(null), 1500);
  };

  const handleInsert = (className: string) => {
    onInsert(className);
  };

  // Filter colors or utilities based on search
  const filteredColors = useMemo(() => {
    if (!search) return COLORS;
    return COLORS.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  }, [search]);

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
            <Palette className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Tailwind Palette</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="px-4 py-3 border-b border-white/5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search colors or utilities..."
              className="w-full pl-10 pr-4 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('colors')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'colors'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Palette className="w-4 h-4" />
              Colors
            </button>
            <button
              onClick={() => setActiveTab('utilities')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'utilities'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Box className="w-4 h-4" />
              Utilities
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'colors' ? (
            <div className="p-4">
              {/* Color selector */}
              <div className="flex flex-wrap gap-2 mb-4">
                {filteredColors.map(color => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      selectedColor === color
                        ? 'bg-white/10 text-white ring-2 ring-blue-500'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {color}
                  </button>
                ))}
              </div>

              {/* Shade grid */}
              <div className="space-y-3">
                {/* Background colors */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Background</h3>
                  <div className="grid grid-cols-11 gap-1">
                    {SHADES.map(shade => {
                      const className = `bg-${selectedColor}-${shade}`;
                      const colorValue = getColorValue(selectedColor, shade);
                      return (
                        <button
                          key={shade}
                          onClick={() => handleInsert(className)}
                          onDoubleClick={() => handleCopy(className)}
                          className="group relative aspect-square rounded-md transition-transform hover:scale-110 hover:z-10"
                          style={{ backgroundColor: colorValue }}
                          title={className}
                        >
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono opacity-0 group-hover:opacity-100 bg-black/50 rounded-md">
                            {shade}
                          </span>
                          {copiedClass === className && (
                            <span className="absolute inset-0 flex items-center justify-center bg-green-500 rounded-md">
                              <Check className="w-3 h-3 text-white" />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Text colors */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Text</h3>
                  <div className="flex flex-wrap gap-1">
                    {SHADES.map(shade => {
                      const className = `text-${selectedColor}-${shade}`;
                      const colorValue = getColorValue(selectedColor, shade);
                      return (
                        <button
                          key={shade}
                          onClick={() => handleInsert(className)}
                          onDoubleClick={() => handleCopy(className)}
                          className="px-2 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 transition-colors"
                          style={{ color: colorValue }}
                          title={className}
                        >
                          {shade}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Border colors */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Border</h3>
                  <div className="flex flex-wrap gap-1">
                    {SHADES.map(shade => {
                      const className = `border-${selectedColor}-${shade}`;
                      const colorValue = getColorValue(selectedColor, shade);
                      return (
                        <button
                          key={shade}
                          onClick={() => handleInsert(className)}
                          onDoubleClick={() => handleCopy(className)}
                          className="w-8 h-8 rounded border-2 bg-slate-900 hover:scale-110 transition-transform"
                          style={{ borderColor: colorValue }}
                          title={className}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-6">
              {Object.entries(UTILITY_CATEGORIES).map(([key, category]) => (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-slate-400">{category.icon}</span>
                    <h3 className="text-sm font-semibold text-white">{category.name}</h3>
                  </div>
                  <div className="space-y-3">
                    {category.items
                      .filter(item =>
                        !search ||
                        item.label.toLowerCase().includes(search.toLowerCase()) ||
                        item.classes.some(c => c.toLowerCase().includes(search.toLowerCase()))
                      )
                      .map(item => (
                        <div key={item.label}>
                          <p className="text-xs text-slate-500 mb-1.5">{item.label}</p>
                          <div className="flex flex-wrap gap-1">
                            {item.classes.map(cls => (
                              <button
                                key={cls}
                                onClick={() => handleInsert(cls)}
                                onDoubleClick={() => handleCopy(cls)}
                                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                                  copiedClass === cls
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                                }`}
                              >
                                {copiedClass === cls ? <Check className="w-3 h-3 inline mr-1" /> : null}
                                {cls}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-white/5 bg-slate-950/50">
          <p className="text-[10px] text-slate-600 text-center">
            Click to insert • Double-click to copy • Ctrl+T to open
          </p>
        </div>
      </div>
    </div>
  );
};
