/**
 * TitleBar - IDE title bar with traffic lights and breadcrumb navigation
 */
import React, { memo } from 'react';
import { ChevronRight, FolderOpen, Circle, Info } from 'lucide-react';
import { TrafficLights } from './TrafficLights';
import { useAppContext } from '../../contexts/AppContext';
import { useUI } from '../../contexts/UIContext';

interface TitleBarProps {
  onInfoClick?: () => void;
}

export const TitleBar = memo(function TitleBar({
  onInfoClick,
}: TitleBarProps) {
  const ctx = useAppContext();
  const ui = useUI();

  // Get project name and active file for breadcrumb
  const projectName = ctx.currentProject?.name || 'FluidFlow';
  const activeFile = ctx.activeFile || '';
  const hasUncommitted = ctx.hasUncommittedChanges;

  // Split file path into parts for breadcrumb
  const pathParts = activeFile.split('/').filter(Boolean);

  // Click on file path opens Code tab
  const handleFileClick = () => {
    if (activeFile) {
      ui.setActiveTab('code');
    }
  };

  return (
    <header className="h-10 bg-slate-950 border-b border-white/5 flex items-center px-4 justify-between select-none shrink-0">
      {/* Left section: Traffic lights + Breadcrumb */}
      <div className="flex items-center gap-4">
        <TrafficLights />

        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
            {projectName}
          </span>

          {pathParts.map((part, index) => (
            <React.Fragment key={index}>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <button
                onClick={handleFileClick}
                className={`${
                  index === pathParts.length - 1
                    ? 'text-slate-300 hover:text-blue-400'
                    : 'text-slate-500 hover:text-slate-300'
                } transition-colors cursor-pointer`}
                title="Open in Code Editor"
              >
                {part}
              </button>
            </React.Fragment>
          ))}

          {/* Unsaved indicator */}
          {hasUncommitted && (
            <Circle className="w-1.5 h-1.5 ml-1 fill-amber-400 text-amber-400" />
          )}
        </div>
      </div>

      {/* Center: App name - clickable for info */}
      <button
        onClick={onInfoClick}
        className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2 hover:opacity-80 transition-opacity"
        title="About FluidFlow"
      >
        <span className="text-[10px] text-slate-600 uppercase tracking-widest font-medium">
          FluidFlow
        </span>
      </button>

      {/* Right section: Info */}
      <div className="flex items-center gap-2">
        <button
          onClick={onInfoClick}
          className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-500 hover:text-blue-400 border border-transparent hover:border-blue-500/20 hover:bg-blue-500/5 rounded transition-all"
          title="About FluidFlow"
        >
          <Info className="w-3 h-3" />
          <span>About</span>
        </button>
      </div>
    </header>
  );
});

export default TitleBar;
