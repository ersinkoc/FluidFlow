import React from 'react';
import { X, CheckCircle, AlertCircle, Loader2, FileCode, Zap } from 'lucide-react';

interface AutoFixModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage: string;
  logs: string[];
  stage: 'analyzing' | 'generating' | 'fixing' | 'completed' | 'failed' | null;
  originalCode?: string;
  fixedCode?: string;
}

export const AutoFixModal: React.FC<AutoFixModalProps> = ({
  isOpen,
  onClose,
  errorMessage,
  logs,
  stage,
  originalCode: _originalCode,
  fixedCode
}) => {
  if (!isOpen) return null;

  const getStageInfo = () => {
    switch (stage) {
      case 'analyzing':
        return { icon: <Loader2 className="w-5 h-5 animate-spin text-blue-400" />, text: 'Analyzing error...', color: 'text-blue-400' };
      case 'generating':
        return { icon: <Zap className="w-5 h-5 text-purple-400" />, text: 'Generating solution...', color: 'text-purple-400' };
      case 'fixing':
        return { icon: <Loader2 className="w-5 h-5 animate-spin text-orange-400" />, text: 'Applying fix...', color: 'text-orange-400' };
      case 'completed':
        return { icon: <CheckCircle className="w-5 h-5 text-green-400" />, text: 'Error fixed successfully!', color: 'text-green-400' };
      case 'failed':
        return { icon: <AlertCircle className="w-5 h-5 text-red-400" />, text: 'Auto-fix failed', color: 'text-red-400' };
      default:
        return { icon: null, text: '', color: '' };
    }
  };

  const stageInfo = getStageInfo();

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950">
          <div className="flex items-center gap-3">
            <Zap className="w-6 h-6 text-orange-400" />
            <div>
              <h2 className="text-xl font-bold text-white">Auto-Fix in Progress</h2>
              <p className="text-sm text-slate-400">AI is analyzing and fixing the error</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
            disabled={stage === 'analyzing' || stage === 'generating' || stage === 'fixing'}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left Panel - Error & Logs */}
          <div className="w-1/2 border-r border-white/5 flex flex-col">
            {/* Error Message */}
            <div className="p-4 bg-slate-950/50 border-b border-white/5">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Error Message
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300 font-mono break-all">{errorMessage}</p>
                </div>
              </div>
            </div>

            {/* Stage Indicator */}
            <div className="p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                {stageInfo.icon}
                <span className={`text-sm font-medium ${stageInfo.color}`}>{stageInfo.text}</span>
              </div>
            </div>

            {/* Error Fix Chat Log */}
            <div className="flex-1 overflow-auto p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  🔧 Error Fix Chat
                </div>
                {stage === 'completed' && (
                  <button className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>Resolved</span>
                  </button>
                )}
              </div>

              <div className="space-y-3 font-mono text-sm max-h-[500px] overflow-y-auto pr-2">
                {logs.length === 0 ? (
                  <div className="p-3 bg-slate-800/20 rounded-lg border border-slate-700/50">
                    <p className="text-slate-500 italic text-xs">Waiting for error analysis...</p>
                  </div>
                ) : (
                  logs.map((log, index) => {
                    // Determine log type
                    const isSystem = log.startsWith('[SYSTEM]');
                    const isUser = log.startsWith('[USER]');
                    const isError = log.startsWith('[ERROR]');
                    const isSuccess = log.startsWith('[SUCCESS]');

                    let bgColor = 'bg-slate-800/30';
                    let borderColor = 'border-blue-500/30';
                    let textColor = 'text-slate-300';
                    let icon = '🤖';

                    if (isSystem) {
                      bgColor = 'bg-purple-500/10';
                      borderColor = 'border-purple-500/30';
                      textColor = 'text-purple-300';
                      icon = '⚙️';
                    } else if (isUser) {
                      bgColor = 'bg-blue-500/10';
                      borderColor = 'border-blue-500/30';
                      textColor = 'text-blue-300';
                      icon = '👤';
                    } else if (isError) {
                      bgColor = 'bg-red-500/10';
                      borderColor = 'border-red-500/30';
                      textColor = 'text-red-300';
                      icon = '❌';
                    } else if (isSuccess) {
                      bgColor = 'bg-green-500/10';
                      borderColor = 'border-green-500/30';
                      textColor = 'text-green-300';
                      icon = '✅';
                    }

                    return (
                      <div key={index} className={`p-3 ${bgColor} rounded-lg border ${borderColor}`}>
                        <div className="flex items-start gap-2">
                          <span className="text-lg flex-shrink-0">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold ${textColor}`}>
                                {isSystem ? 'SYSTEM' : isUser ? 'USER' : isError ? 'ERROR' : isSuccess ? 'SUCCESS' : 'ASSISTANT'}
                              </span>
                              <span className="text-[10px] text-slate-600">
                                {new Date().toLocaleTimeString()}
                              </span>
                            </div>
                            <p className={`${textColor} text-sm leading-relaxed whitespace-pre-wrap break-words`}>
                              {log.replace(/^\[(SYSTEM|USER|ERROR|SUCCESS)\]\s*/, '')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Code Comparison */}
          <div className="w-1/2 flex flex-col">
            {fixedCode ? (
              <>
                {/* Fixed Code */}
                <div className="p-4 bg-slate-950/50 border-b border-white/5">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm font-semibold text-green-400">Fixed Code</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <FileCode size={12} />
                    <span>src/App.tsx</span>
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  <pre className="p-4 text-sm text-slate-300 font-mono whitespace-pre-wrap">
                    {fixedCode}
                  </pre>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 text-slate-600 mx-auto mb-4 animate-spin" />
                  <p className="text-slate-500">Waiting for AI to generate the fix...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 bg-slate-950/50">
          <div className="text-xs text-slate-500">
            {stage === 'completed' && 'Fix applied successfully. You can now close this window.'}
            {stage === 'failed' && 'Auto-fix could not resolve the error. Try manual fixing.'}
            {stage && stage !== 'completed' && stage !== 'failed' && 'Please wait while AI analyzes the error...'}
          </div>
          {stage === 'completed' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Apply Fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
