import React, { useState } from 'react';
import { X, Send, Loader2, MousePointer2, Sparkles, Layers, Target } from 'lucide-react';

export interface InspectedElement {
  tagName: string;
  className: string;
  id?: string;
  textContent?: string;
  rect: { top: number; left: number; width: number; height: number };
  componentName?: string;
  parentComponents?: string[];
  styles?: Record<string, string>;
  // FluidFlow identification attributes
  ffGroup?: string;  // data-ff-group value
  ffId?: string;     // data-ff-id value
}

export type EditScope = 'element' | 'group';

interface ComponentInspectorProps {
  element: InspectedElement | null;
  onClose: () => void;
  onSubmit: (prompt: string, element: InspectedElement, scope: EditScope) => void;
  isProcessing: boolean;
}

export const ComponentInspector: React.FC<ComponentInspectorProps> = ({
  element,
  onClose,
  onSubmit,
  isProcessing
}) => {
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<EditScope>('element');

  if (!element) return null;

  const hasGroup = !!element.ffGroup;
  const hasId = !!element.ffId;

  const handleSubmit = () => {
    if (!prompt.trim()) return;

    // Build enhanced prompt with scope context
    let enhancedPrompt = prompt;

    if (scope === 'group' && hasGroup) {
      enhancedPrompt = `[SCOPE: Apply to ALL elements with data-ff-group="${element.ffGroup}"]\n${prompt}`;
    } else if (hasId) {
      enhancedPrompt = `[SCOPE: Apply ONLY to element with data-ff-id="${element.ffId}"${hasGroup ? ` in group "${element.ffGroup}"` : ''}]\n${prompt}`;
    }

    onSubmit(enhancedPrompt, element, scope);
  };

  const quickActions = [
    { label: 'Beautify', prompt: 'Make this component more visually appealing with better colors, shadows, and spacing' },
    { label: 'Add Animation', prompt: 'Add smooth hover animation and transition effects' },
    { label: 'Improve UX', prompt: 'Improve the user experience with better feedback and interactions' },
    { label: 'Make Responsive', prompt: 'Make this component fully responsive for all screen sizes' },
    { label: 'Add Dark Mode', prompt: 'Add dark mode support with appropriate colors' },
    { label: 'Fix Accessibility', prompt: 'Improve accessibility with proper ARIA labels and keyboard support' },
  ];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-[520px] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-purple-500/10">
          <div className="flex items-center gap-2">
            <MousePointer2 className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-white">Element Selected</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Element Info */}
        <div className="px-4 py-3 border-b border-white/5 bg-slate-950/50">
          <div className="flex items-center gap-2 flex-wrap">
            {element.componentName && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs font-mono">
                {element.componentName}
              </span>
            )}
            <span className="px-2 py-1 bg-blue-500/20 text-blue-300 rounded text-xs font-mono">
              &lt;{element.tagName.toLowerCase()}&gt;
            </span>
            {element.ffGroup && (
              <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-mono">
                group:{element.ffGroup}
              </span>
            )}
            {element.ffId && (
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded text-xs font-mono">
                id:{element.ffId}
              </span>
            )}
            {element.id && (
              <span className="px-2 py-1 bg-amber-500/20 text-amber-300 rounded text-xs font-mono">
                #{element.id}
              </span>
            )}
            {element.className && (
              <span className="px-2 py-1 bg-slate-500/20 text-slate-400 rounded text-xs font-mono truncate max-w-[200px]" title={element.className}>
                .{element.className.split(' ')[0]}
              </span>
            )}
          </div>
          {element.textContent && (
            <p className="mt-2 text-xs text-slate-500 truncate">
              "{element.textContent}"
            </p>
          )}
        </div>

        {/* Scope Selector - Only show if we have ff-group */}
        {hasGroup && (
          <div className="px-4 py-3 border-b border-white/5 bg-slate-900/50">
            <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Apply Changes To</p>
            <div className="flex gap-2">
              <button
                onClick={() => setScope('element')}
                disabled={isProcessing}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  scope === 'element'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-800/50 border-2 border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Target className="w-4 h-4" />
                <div className="text-left">
                  <div>Only This Element</div>
                  {hasId && <div className="text-[10px] opacity-70">id: {element.ffId}</div>}
                </div>
              </button>
              <button
                onClick={() => setScope('group')}
                disabled={isProcessing}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  scope === 'group'
                    ? 'bg-emerald-500/20 border-2 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800/50 border-2 border-transparent text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Layers className="w-4 h-4" />
                <div className="text-left">
                  <div>All in Group</div>
                  <div className="text-[10px] opacity-70">group: {element.ffGroup}</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="px-4 py-3 border-b border-white/5">
          <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide">Quick Actions</p>
          <div className="flex flex-wrap gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => setPrompt(action.prompt)}
                disabled={isProcessing}
                className="px-2.5 py-1.5 text-xs bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 hover:text-white rounded-lg border border-white/5 hover:border-purple-500/30 transition-all disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Prompt Input */}
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="Describe what to change..."
                disabled={isProcessing}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/50 disabled:opacity-50"
                autoFocus
              />
              <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400/50" />
            </div>
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isProcessing}
              className="p-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 text-center">
            {scope === 'group' && hasGroup
              ? `Changes will apply to all "${element.ffGroup}" elements`
              : hasId
                ? `Changes will apply only to "${element.ffId}"`
                : element.id
                  ? `Editing <${element.tagName.toLowerCase()}>#${element.id}`
                  : element.className
                    ? `Editing <${element.tagName.toLowerCase()}>.${element.className.split(' ')[0]}`
                    : element.textContent
                      ? `Editing <${element.tagName.toLowerCase()}> "${element.textContent.slice(0, 30)}${element.textContent.length > 30 ? '...' : ''}"`
                      : `Editing <${element.tagName.toLowerCase()}> in ${element.componentName || 'component'}`
            }
          </p>
        </div>
      </div>
    </div>
  );
};

// Inspection overlay that shows on the preview when inspect mode is active
export const InspectionOverlay: React.FC<{
  isActive: boolean;
  hoveredRect: { top: number; left: number; width: number; height: number } | null;
  selectedRect: { top: number; left: number; width: number; height: number } | null;
}> = ({ isActive, hoveredRect, selectedRect }) => {
  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[100]">
      {/* Hovered element highlight */}
      {hoveredRect && !selectedRect && (
        <div
          className="absolute border-2 border-blue-400 bg-blue-400/10 transition-all duration-75"
          style={{
            top: hoveredRect.top,
            left: hoveredRect.left,
            width: hoveredRect.width,
            height: hoveredRect.height,
          }}
        >
          <div className="absolute -top-6 left-0 px-2 py-0.5 bg-blue-500 text-white text-[10px] rounded whitespace-nowrap">
            Click to select
          </div>
        </div>
      )}

      {/* Selected element highlight */}
      {selectedRect && (
        <div
          className="absolute border-2 border-purple-500 bg-purple-500/10 ring-4 ring-purple-500/20"
          style={{
            top: selectedRect.top,
            left: selectedRect.left,
            width: selectedRect.width,
            height: selectedRect.height,
          }}
        />
      )}

      {/* Info banner when in inspect mode */}
      {!selectedRect && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-blue-500/90 backdrop-blur text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2">
          <MousePointer2 className="w-4 h-4" />
          Hover & click to select a component
        </div>
      )}
    </div>
  );
};
