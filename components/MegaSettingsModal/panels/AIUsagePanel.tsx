import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Zap,
  Clock,
  RefreshCw,
  Trash2,
  Download,
  Upload,
  Calendar,
  Activity,
  Cpu,
  Target,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ConfirmModal } from '../../ContextIndicator/ConfirmModal';
import { SettingsSection } from '../shared';
import {
  getAllRecords,
  getStats,
  clearAllRecords,
  exportRecords,
  importRecords,
  deleteOldRecords,
  formatCost,
} from '../../../services/analyticsStorage';
import type { UsageRecord, UsageStats } from '../../../types';

type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all';

export const AIUsagePanel: React.FC = () => {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showPruneConfirm, setShowPruneConfirm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    overview: true,
    providers: true,
    models: false,
    categories: false,
    timeline: false,
    recent: false,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const daysCount = timeRange === 'all' ? 365 : parseInt(timeRange);
      const allRecords = await getAllRecords();

      // Filter by time range
      const now = Date.now();
      const rangeMs =
        timeRange === 'all'
          ? Infinity
          : timeRange === '24h'
            ? 24 * 60 * 60 * 1000
            : timeRange === '7d'
              ? 7 * 24 * 60 * 60 * 1000
              : timeRange === '30d'
                ? 30 * 24 * 60 * 60 * 1000
                : 90 * 24 * 60 * 60 * 1000;

      const filtered = allRecords.filter((r) => now - r.timestamp < rangeMs);
      setRecords(filtered);

      const statsData = await getStats(daysCount);
      setStats(statsData);
    } catch (err) {
      console.error('[AIUsagePanel] Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleExport = async () => {
    try {
      const data = await exportRecords();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fluidflow-ai-usage-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[AIUsagePanel] Export failed:', err);
    }
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const count = await importRecords(text);
        if (count > 0) {
          loadData();
        }
      } catch (err) {
        console.error('[AIUsagePanel] Import failed:', err);
      }
    };
    input.click();
  };

  const handleClear = async () => {
    await clearAllRecords();
    setShowClearConfirm(false);
    loadData();
  };

  const handlePrune = async () => {
    await deleteOldRecords(90);
    setShowPruneConfirm(false);
    loadData();
  };

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  // Time range options
  const timeRangeOptions: { value: TimeRange; label: string }[] = [
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
  ];

  // Category labels and colors
  const categoryConfig: Record<string, { label: string; color: string }> = {
    generation: { label: 'Code Generation', color: 'blue' },
    'quick-edit': { label: 'Quick Edit', color: 'purple' },
    'auto-fix': { label: 'Auto Fix', color: 'green' },
    'git-commit': { label: 'Git Commit', color: 'amber' },
    'auto-commit': { label: 'Auto Commit', color: 'orange' },
    'prompt-improver': { label: 'Prompt Improver', color: 'pink' },
    accessibility: { label: 'Accessibility', color: 'cyan' },
    other: { label: 'Other', color: 'slate' },
  };

  // Calculate usage chart data (last 7 days)
  const chartData = useMemo(() => {
    if (!stats) return [];
    const days = Object.entries(stats.byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-7);
    const maxCost = Math.max(...days.map(([, d]) => d.totalCost), 0.001);
    return days.map(([date, data]) => ({
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      ...data,
      heightPercent: (data.totalCost / maxCost) * 100,
    }));
  }, [stats]);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg">
            <BarChart3 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">AI Usage Analytics</h2>
            <p className="text-xs text-slate-400">Track token usage, costs, and performance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-1.5 text-xs bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {timeRangeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={loadData}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="w-12 h-12 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No Usage Data Yet</h3>
          <p className="text-sm text-slate-400 max-w-md">
            AI usage will be tracked automatically when you generate code, commit messages, or use other AI features.
          </p>
        </div>
      ) : (
        <>
          {/* Overview Stats */}
          <CollapsibleSection
            title="Overview"
            icon={<TrendingUp className="w-4 h-4" />}
            expanded={expandedSections.overview}
            onToggle={() => toggleSection('overview')}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Total Cost */}
              <StatCard
                icon={<DollarSign className="w-4 h-4 text-green-400" />}
                label="Total Cost"
                value={formatCost(stats?.totalCost || 0)}
                subValue="estimated"
                color="green"
              />
              {/* Total Tokens */}
              <StatCard
                icon={<Zap className="w-4 h-4 text-amber-400" />}
                label="Total Tokens"
                value={formatNumber(stats?.totalTokens || 0)}
                subValue={`${formatNumber(stats?.totalInputTokens || 0)} in / ${formatNumber(stats?.totalOutputTokens || 0)} out`}
                color="amber"
              />
              {/* Total Requests */}
              <StatCard
                icon={<Activity className="w-4 h-4 text-blue-400" />}
                label="Requests"
                value={formatNumber(stats?.totalRequests || 0)}
                subValue={`${stats?.successRate.toFixed(1)}% success`}
                color="blue"
              />
              {/* Avg Duration */}
              <StatCard
                icon={<Clock className="w-4 h-4 text-purple-400" />}
                label="Avg Response"
                value={formatDuration(stats?.avgDuration || 0)}
                subValue="per request"
                color="purple"
              />
            </div>
          </CollapsibleSection>

          {/* Cost Trend Chart */}
          {chartData.length > 0 && (
            <CollapsibleSection
              title="Cost Trend (7 Days)"
              icon={<Calendar className="w-4 h-4" />}
              expanded={expandedSections.timeline}
              onToggle={() => toggleSection('timeline')}
            >
              <div className="h-40 flex items-end gap-2">
                {chartData.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[10px] text-slate-500">{formatCost(day.totalCost)}</div>
                    <div
                      className="w-full bg-gradient-to-t from-blue-500/50 to-blue-400/20 rounded-t"
                      style={{ height: `${Math.max(day.heightPercent, 4)}%` }}
                    />
                    <div className="text-[10px] text-slate-400 truncate w-full text-center">{day.date.split(' ')[0]}</div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* By Provider */}
          <CollapsibleSection
            title="By Provider"
            icon={<Cpu className="w-4 h-4" />}
            expanded={expandedSections.providers}
            onToggle={() => toggleSection('providers')}
            badge={Object.keys(stats?.byProvider || {}).length.toString()}
          >
            <div className="space-y-3">
              {Object.entries(stats?.byProvider || {})
                .sort(([, a], [, b]) => b.totalCost - a.totalCost)
                .map(([provider, data]) => (
                  <ProviderRow
                    key={provider}
                    name={provider}
                    requests={data.requests}
                    tokens={data.inputTokens + data.outputTokens}
                    cost={data.totalCost}
                    avgDuration={data.avgDuration}
                    percentage={(data.totalCost / (stats?.totalCost || 1)) * 100}
                  />
                ))}
            </div>
          </CollapsibleSection>

          {/* By Model */}
          <CollapsibleSection
            title="By Model"
            icon={<Target className="w-4 h-4" />}
            expanded={expandedSections.models}
            onToggle={() => toggleSection('models')}
            badge={Object.keys(stats?.byModel || {}).length.toString()}
          >
            <div className="space-y-2">
              {Object.entries(stats?.byModel || {})
                .sort(([, a], [, b]) => b.requests - a.requests)
                .map(([model, data]) => (
                  <ModelRow
                    key={model}
                    name={model}
                    provider={data.provider}
                    requests={data.requests}
                    tokens={data.inputTokens + data.outputTokens}
                    cost={data.totalCost}
                  />
                ))}
            </div>
          </CollapsibleSection>

          {/* By Category */}
          <CollapsibleSection
            title="By Category"
            icon={<Activity className="w-4 h-4" />}
            expanded={expandedSections.categories}
            onToggle={() => toggleSection('categories')}
          >
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(stats?.byCategory || {})
                .sort(([, a], [, b]) => b.requests - a.requests)
                .map(([category, data]) => {
                  const config = categoryConfig[category] || { label: category, color: 'slate' };
                  return (
                    <CategoryCard
                      key={category}
                      label={config.label}
                      color={config.color}
                      requests={data.requests}
                      tokens={data.inputTokens + data.outputTokens}
                      cost={data.totalCost}
                    />
                  );
                })}
            </div>
          </CollapsibleSection>

          {/* Recent Activity */}
          <CollapsibleSection
            title="Recent Activity"
            icon={<Clock className="w-4 h-4" />}
            expanded={expandedSections.recent}
            onToggle={() => toggleSection('recent')}
            badge={records.length.toString()}
          >
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {records.slice(0, 20).map((record) => (
                <ActivityRow key={record.id} record={record} />
              ))}
              {records.length > 20 && (
                <div className="text-center text-xs text-slate-500 py-2">
                  And {records.length - 20} more...
                </div>
              )}
            </div>
          </CollapsibleSection>

          {/* Data Management */}
          <SettingsSection title="Data Management" description="Export, import, or clear usage data">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export Data
              </button>
              <button
                onClick={handleImport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-500/20 text-slate-400 hover:bg-slate-500/30 rounded-lg transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Data
              </button>
              <button
                onClick={() => setShowPruneConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg transition-colors"
              >
                <Clock className="w-3.5 h-3.5" />
                Prune Old (&gt;90d)
              </button>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear All
              </button>
            </div>
          </SettingsSection>
        </>
      )}

      {/* Clear Confirmation Modal */}
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClear}
        title="Clear All Usage Data"
        message="This will permanently delete all AI usage records. This action cannot be undone."
        confirmText="Clear All"
        confirmVariant="danger"
      />

      {/* Prune Confirmation Modal */}
      <ConfirmModal
        isOpen={showPruneConfirm}
        onClose={() => setShowPruneConfirm(false)}
        onConfirm={handlePrune}
        title="Prune Old Records"
        message="This will delete all usage records older than 90 days. Recent data will be preserved."
        confirmText="Prune"
        confirmVariant="warning"
      />
    </div>
  );
};

// Collapsible Section Component
interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  icon,
  expanded,
  onToggle,
  children,
  badge,
}) => (
  <div className="bg-slate-800/50 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>
        <span className="text-sm font-medium text-white">{title}</span>
        {badge && (
          <span className="px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-400 rounded">
            {badge}
          </span>
        )}
      </div>
      {expanded ? (
        <ChevronDown className="w-4 h-4 text-slate-400" />
      ) : (
        <ChevronRight className="w-4 h-4 text-slate-400" />
      )}
    </button>
    {expanded && <div className="p-4 pt-0">{children}</div>}
  </div>
);

// Stat Card Component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subValue?: string;
  color: 'green' | 'amber' | 'blue' | 'purple';
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, subValue, color }) => {
  const bgColors = {
    green: 'bg-green-500/10 border-green-500/20',
    amber: 'bg-amber-500/10 border-amber-500/20',
    blue: 'bg-blue-500/10 border-blue-500/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
  };

  return (
    <div className={`p-4 rounded-lg border ${bgColors[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {subValue && <div className="text-[10px] text-slate-500 mt-1">{subValue}</div>}
    </div>
  );
};

// Provider Row Component
interface ProviderRowProps {
  name: string;
  requests: number;
  tokens: number;
  cost: number;
  avgDuration: number;
  percentage: number;
}

const ProviderRow: React.FC<ProviderRowProps> = ({ name, requests, tokens, cost, avgDuration, percentage }) => (
  <div className="p-3 bg-slate-900/50 rounded-lg">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-blue-400" />
        <span className="font-medium text-white capitalize">{name}</span>
      </div>
      <span className="text-sm font-semibold text-green-400">{formatCost(cost)}</span>
    </div>
    <div className="flex items-center gap-4 text-xs text-slate-400">
      <span>{requests} requests</span>
      <span>{(tokens / 1000).toFixed(1)}K tokens</span>
      <span>{(avgDuration / 1000).toFixed(1)}s avg</span>
    </div>
    <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  </div>
);

// Model Row Component
interface ModelRowProps {
  name: string;
  provider: string;
  requests: number;
  tokens: number;
  cost: number;
}

const ModelRow: React.FC<ModelRowProps> = ({ name, provider, requests, tokens, cost }) => (
  <div className="flex items-center justify-between p-2 bg-slate-900/30 rounded-lg">
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <Target className="w-3 h-3 text-slate-500 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm text-white truncate">{name.split('/').pop()}</div>
        <div className="text-[10px] text-slate-500">{provider}</div>
      </div>
    </div>
    <div className="flex items-center gap-4 text-xs">
      <span className="text-slate-400">{requests} req</span>
      <span className="text-slate-400">{(tokens / 1000).toFixed(1)}K</span>
      <span className="text-green-400 font-medium">{formatCost(cost)}</span>
    </div>
  </div>
);

// Category Card Component
interface CategoryCardProps {
  label: string;
  color: string;
  requests: number;
  tokens: number;
  cost: number;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ label, color, requests, tokens, cost }) => {
  const colorClasses: Record<string, string> = {
    blue: 'border-blue-500/20 text-blue-400',
    purple: 'border-purple-500/20 text-purple-400',
    green: 'border-green-500/20 text-green-400',
    amber: 'border-amber-500/20 text-amber-400',
    orange: 'border-orange-500/20 text-orange-400',
    pink: 'border-pink-500/20 text-pink-400',
    cyan: 'border-cyan-500/20 text-cyan-400',
    slate: 'border-slate-500/20 text-slate-400',
  };

  return (
    <div className={`p-3 bg-slate-900/30 border rounded-lg ${colorClasses[color] || colorClasses.slate}`}>
      <div className="text-sm font-medium text-white mb-1">{label}</div>
      <div className="flex items-center gap-2 text-xs">
        <span>{requests} req</span>
        <span className="text-slate-500">|</span>
        <span>{(tokens / 1000).toFixed(1)}K tok</span>
        <span className="text-slate-500">|</span>
        <span className="text-green-400">{formatCost(cost)}</span>
      </div>
    </div>
  );
};

// Activity Row Component
interface ActivityRowProps {
  record: UsageRecord;
}

const ActivityRow: React.FC<ActivityRowProps> = ({ record }) => {
  const timeAgo = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="flex items-center gap-3 p-2 bg-slate-900/30 rounded-lg">
      {record.success ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white truncate">{record.model.split('/').pop()}</span>
          <span className="text-[10px] text-slate-500">{record.category}</span>
        </div>
        <div className="text-[10px] text-slate-500">
          {record.totalTokens.toLocaleString()} tokens {record.isEstimated && '(est)'}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs text-green-400">{formatCost(record.totalCost)}</div>
        <div className="text-[10px] text-slate-500">{timeAgo(record.timestamp)}</div>
      </div>
    </div>
  );
};

export default AIUsagePanel;
