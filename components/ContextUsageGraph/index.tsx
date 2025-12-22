/**
 * Context Usage Graph Component
 *
 * Visualizes token usage over time with a sparkline chart
 */

import React, { useMemo } from 'react';
import { Activity, TrendingUp } from 'lucide-react';
import { UsageGraphProps } from './types';

export const ContextUsageGraph: React.FC<UsageGraphProps> = ({
  data,
  height = 60,
  showLabels = true,
  className = '',
}) => {
  const { path, maxTokensInPeriod, minTokensInPeriod } = useMemo(() => {
    if (data.snapshots.length < 2) {
      return { path: '', maxTokensInPeriod: data.currentTokens, minTokensInPeriod: 0 };
    }

    const sortedSnapshots = [...data.snapshots].sort((a, b) => a.timestamp - b.timestamp);
    const maxTokens = Math.max(...sortedSnapshots.map(s => s.tokens));
    const minTokens = Math.min(...sortedSnapshots.map(s => s.tokens));
    const range = maxTokens - minTokens || 1;

    // Build SVG path
    const width = 100; // Use percentages
    const step = width / (sortedSnapshots.length - 1);

    let path = '';
    sortedSnapshots.forEach((snapshot, index) => {
      const x = index * step;
      const y = 100 - ((snapshot.tokens - minTokens) / range) * 100; // Invert Y (SVG coords)
      path += index === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    });

    return {
      path,
      maxTokensInPeriod: maxTokens,
      minTokensInPeriod: minTokens,
    };
  }, [data]);

  const usagePercent = (data.currentTokens / data.maxTokens) * 100;
  const trend = data.snapshots.length >= 2
    ? data.currentTokens - data.snapshots[0].tokens
    : 0;

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {/* Mini sparkline chart */}
      <div className="flex-shrink-0" style={{ width: '120px', height: `${height}px` }}>
        {data.snapshots.length >= 2 ? (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Grid lines */}
            <line x1="0" y1="25" x2="100" y2="25" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
            <line x1="0" y1="75" x2="100" y2="75" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

            {/* Area fill */}
            <path
              d={`${path} L 100 100 L 0 100 Z`}
              fill="rgba(59, 130, 246, 0.1)"
            />

            {/* Line */}
            <path
              d={path}
              fill="none"
              stroke="rgba(59, 130, 246, 0.8)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Current point indicator */}
            <circle
              cx="100"
              cy={100 - ((data.currentTokens - minTokensInPeriod) / (maxTokensInPeriod - minTokensInPeriod || 1)) * 100}
              r="2"
              fill="#60a5fa"
            />
          </svg>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-600">
            Not enough data
          </div>
        )}
      </div>

      {/* Stats */}
      {showLabels && (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-slate-400">Current:</span>
            <span className="font-mono text-white">{data.currentTokens.toLocaleString()}</span>
            <span className="text-slate-500">/ {data.maxTokens.toLocaleString()}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {trend > 0 ? (
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            ) : trend < 0 ? (
              <TrendingUp className="w-4 h-4 text-red-400 rotate-180" />
            ) : null}
            <span className={`font-mono ${
              trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-red-400' : 'text-slate-400'
            }`}>
              {trend > 0 ? '+' : ''}{(trend / 1000).toFixed(1)}k
            </span>
            <span className="text-slate-500">from start</span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent > 80 ? 'bg-red-500' : usagePercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, usagePercent)}%` }}
              />
            </div>
            <span className="text-slate-400 font-mono">{usagePercent.toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContextUsageGraph;
