/**
 * MultiDevicePreview Component
 *
 * Displays the preview in multiple device sizes simultaneously:
 * - Mobile (375px)
 * - Tablet (768px)
 * - Desktop (1440px)
 *
 * All iframes share the same content but render at different viewport widths.
 */

import React, { useMemo, useEffect, useRef } from 'react';
import { Smartphone, Tablet, Monitor, RefreshCw } from 'lucide-react';

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  icon: React.ElementType;
  scale: number; // Scale factor to fit in the view
}

const DEVICES: DeviceConfig[] = [
  { id: 'mobile', name: 'Mobile', width: 375, icon: Smartphone, scale: 0.5 },
  { id: 'tablet', name: 'Tablet', width: 768, icon: Tablet, scale: 0.45 },
  { id: 'desktop', name: 'Desktop', width: 1440, icon: Monitor, scale: 0.35 },
];

interface MultiDevicePreviewProps {
  iframeSrc: string;
  iframeKey: number;
  isGenerating: boolean;
  onReload: () => void;
}

interface DeviceFrameProps {
  config: DeviceConfig;
  blobUrl: string;
  iframeKey: number;
  isGenerating: boolean;
}

const DeviceFrame: React.FC<DeviceFrameProps> = ({ config, blobUrl, iframeKey, isGenerating }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Device label */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{
          backgroundColor: 'var(--theme-glass-200)',
          color: 'var(--theme-text-muted)',
          border: '1px solid var(--theme-border-light)'
        }}
      >
        <config.icon className="w-3.5 h-3.5" />
        <span>{config.name}</span>
        <span className="opacity-50">({config.width}px)</span>
      </div>

      {/* Device frame */}
      <div
        className="relative rounded-xl shadow-xl overflow-hidden transition-transform duration-300 hover:scale-[1.02]"
        style={{
          width: config.width * config.scale,
          height: 600 * config.scale,
          backgroundColor: 'var(--theme-preview-bg)',
          border: '3px solid var(--theme-border)',
        }}
      >
        {/* Notch for mobile */}
        {config.id === 'mobile' && (
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 rounded-b-lg z-10 flex items-center justify-center gap-1"
            style={{ backgroundColor: 'var(--theme-border)' }}
          >
            <div className="w-8 h-1 rounded-full" style={{ backgroundColor: 'var(--theme-glass-300)' }} />
            <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--theme-glass-300)' }} />
          </div>
        )}

        {/* Iframe container with scaling */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{
            width: config.width,
            height: 600,
            transform: `scale(${config.scale})`,
          }}
        >
          <iframe
            ref={iframeRef}
            key={`${iframeKey}-${config.id}`}
            src={blobUrl}
            title={`Preview - ${config.name}`}
            className={`w-full h-full bg-white transition-opacity duration-500 ${isGenerating ? 'opacity-40' : 'opacity-100'}`}
            sandbox="allow-scripts"
            style={{ border: 'none' }}
          />
        </div>

        {/* Loading overlay */}
        {isGenerating && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ backgroundColor: 'color-mix(in srgb, var(--theme-background) 30%, transparent)' }}
          >
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};

export const MultiDevicePreview: React.FC<MultiDevicePreviewProps> = ({
  iframeSrc,
  iframeKey,
  isGenerating,
  onReload,
}) => {
  // Create blob URL for the iframe content
  const blobUrl = useMemo(() => {
    if (!iframeSrc) return '';
    const blob = new Blob([iframeSrc], { type: 'text/html' });
    return URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeSrc, iframeKey]);

  // Clean up blob URL
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (!iframeSrc) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--theme-text-dim)' }}>
        <p className="text-sm">Upload a sketch to generate multi-device preview</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div
        className="flex-none flex items-center justify-between px-4 py-2"
        style={{
          borderBottom: '1px solid var(--theme-border-light)',
          backgroundColor: 'var(--theme-surface-dark)'
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--theme-text-secondary)' }}>
            Multi-Device Preview
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{
            backgroundColor: 'var(--color-success-subtle)',
            color: 'var(--color-success)'
          }}>
            3 Devices
          </span>
        </div>
        <button
          onClick={onReload}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--theme-glass-200)]"
          style={{ color: 'var(--theme-text-muted)' }}
          title="Reload All Devices"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Device grid */}
      <div
        className="flex-1 flex items-center justify-center gap-6 p-6 overflow-auto"
        style={{
          backgroundImage: 'linear-gradient(color-mix(in srgb, var(--theme-border) 30%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--theme-border) 30%, transparent) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        {DEVICES.map((device) => (
          <DeviceFrame
            key={device.id}
            config={device}
            blobUrl={blobUrl}
            iframeKey={iframeKey}
            isGenerating={isGenerating}
          />
        ))}
      </div>

      {/* Footer info */}
      <div
        className="flex-none px-4 py-2 text-center"
        style={{
          borderTop: '1px solid var(--theme-border-light)',
          backgroundColor: 'var(--theme-surface-dark)'
        }}
      >
        <p className="text-[10px]" style={{ color: 'var(--theme-text-dim)' }}>
          Hover over a device to enlarge. All devices share the same code and sync in real-time.
        </p>
      </div>
    </div>
  );
};
