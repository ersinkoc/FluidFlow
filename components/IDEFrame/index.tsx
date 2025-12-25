/**
 * IDEFrame - Main IDE-style window frame
 *
 * Provides:
 * - Title bar with traffic lights and breadcrumb
 * - Activity bar (left sidebar with icons)
 * - Main content area
 * - Status bar at the bottom
 */
import React, { memo } from 'react';
import { TitleBar } from './TitleBar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from '../StatusBar';

interface IDEFrameProps {
  children: React.ReactNode;
  showActivityBar?: boolean;
  showTitleBar?: boolean;
  showStatusBar?: boolean;
  onChatClick?: () => void;
  onSettingsClick?: () => void;
  onInfoClick?: () => void;
  onOpenGitTab?: () => void;
  onOpenProjectsTab?: () => void;
  chatUnread?: number;
}

export const IDEFrame = memo(function IDEFrame({
  children,
  showActivityBar = true,
  showTitleBar = true,
  showStatusBar = true,
  onChatClick,
  onSettingsClick,
  onInfoClick,
  onOpenGitTab,
  onOpenProjectsTab,
  chatUnread = 0,
}: IDEFrameProps) {
  return (
    <div className="flex flex-col h-full w-full bg-slate-950 overflow-hidden">
      {/* Title Bar */}
      {showTitleBar && (
        <TitleBar
          onInfoClick={onInfoClick}
        />
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity Bar */}
        {showActivityBar && (
          <ActivityBar
            onChatClick={onChatClick}
            onSettingsClick={onSettingsClick}
            chatUnread={chatUnread}
          />
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {children}
        </main>
      </div>

      {/* Status Bar */}
      {showStatusBar && (
        <StatusBar
          onOpenGitTab={onOpenGitTab}
          onOpenProjectsTab={onOpenProjectsTab}
        />
      )}
    </div>
  );
});

// Re-export sub-components
export { TitleBar } from './TitleBar';
export { TrafficLights } from './TrafficLights';
export { ActivityBar } from './ActivityBar';

export default IDEFrame;
