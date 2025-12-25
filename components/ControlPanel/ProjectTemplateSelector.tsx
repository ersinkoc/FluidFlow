import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, LayoutDashboard, Rocket, ClipboardList, Check, ChevronRight,
  FileCode, Sparkles
} from 'lucide-react';
import { PROJECT_TEMPLATES, ProjectTemplate } from '@/constants/projectTemplates';
import type { FileSystem } from '@/types';

const ICON_MAP: Record<string, typeof LayoutDashboard> = {
  LayoutDashboard,
  Rocket,
  ClipboardList,
};

interface ProjectTemplateSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (name: string, description: string, files: FileSystem) => Promise<void>;
  isLoading?: boolean;
}

export const ProjectTemplateSelector: React.FC<ProjectTemplateSelectorProps> = ({
  isOpen,
  onClose,
  onSelectTemplate,
  isLoading = false,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [projectName, setProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSelectTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setProjectName(template.name);
  };

  const handleCreate = async () => {
    if (!selectedTemplate || !projectName.trim()) return;

    setIsCreating(true);
    try {
      await onSelectTemplate(
        projectName.trim(),
        selectedTemplate.description,
        selectedTemplate.files
      );
      handleClose();
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setSelectedTemplate(null);
    setProjectName('');
    onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-4xl max-h-[85vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col mx-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gradient-to-r from-blue-500/10 to-purple-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Start from Template</h2>
              <p className="text-xs text-slate-400">Choose a pre-built template to get started quickly</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Templates Grid */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROJECT_TEMPLATES.map((template) => {
                const Icon = ICON_MAP[template.icon] || LayoutDashboard;
                const isSelected = selectedTemplate?.id === template.id;

                return (
                  <button
                    key={template.id}
                    onClick={() => handleSelectTemplate(template)}
                    className={`group relative p-5 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-white/5 bg-slate-800/30 hover:border-white/20 hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Selected Indicator */}
                    {isSelected && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${template.previewColor} flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>

                    {/* Info */}
                    <h3 className="text-base font-semibold text-white mb-1">{template.name}</h3>
                    <p className="text-xs text-slate-400 mb-4 line-clamp-2">{template.description}</p>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1.5">
                      {template.features.slice(0, 3).map((feature) => (
                        <span
                          key={feature}
                          className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-400 rounded-full"
                        >
                          {feature}
                        </span>
                      ))}
                      {template.features.length > 3 && (
                        <span className="text-[10px] px-2 py-0.5 bg-slate-700/50 text-slate-500 rounded-full">
                          +{template.features.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Empty/Blank Project Option */}
              <button
                onClick={handleClose}
                className="group p-5 rounded-xl border-2 border-dashed border-white/10 hover:border-white/20 bg-slate-800/10 hover:bg-slate-800/30 transition-all text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-700/50 flex items-center justify-center mb-4">
                  <FileCode className="w-6 h-6 text-slate-500" />
                </div>
                <h3 className="text-base font-semibold text-slate-400 group-hover:text-white mb-1">Start Blank</h3>
                <p className="text-xs text-slate-500">Create an empty project and build from scratch</p>
              </button>
            </div>
          </div>

          {/* Preview Panel */}
          {selectedTemplate && (
            <div className="w-80 border-l border-white/5 bg-slate-950/50 flex flex-col">
              {/* Preview Header */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${selectedTemplate.previewColor} flex items-center justify-center`}>
                    {(() => {
                      const Icon = ICON_MAP[selectedTemplate.icon] || LayoutDashboard;
                      return <Icon className="w-5 h-5 text-white" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{selectedTemplate.name}</h3>
                    <p className="text-[10px] text-slate-500">{selectedTemplate.category}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-4">{selectedTemplate.description}</p>

                {/* Features List */}
                <div className="space-y-1.5">
                  {selectedTemplate.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-xs text-slate-300">
                      <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {/* File Preview */}
              <div className="flex-1 p-4 overflow-y-auto">
                <h4 className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Included Files</h4>
                <div className="space-y-1">
                  {Object.keys(selectedTemplate.files).map((file) => (
                    <div key={file} className="flex items-center gap-2 text-xs text-slate-400 py-1">
                      <FileCode className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate font-mono">{file}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Create Form */}
              <div className="p-4 border-t border-white/5 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="My Project"
                    className="w-full px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={!projectName.trim() || isCreating || isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
                >
                  {isCreating || isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" />
                      Create Project
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ProjectTemplateSelector;
