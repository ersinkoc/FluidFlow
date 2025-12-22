import React, { useRef } from 'react';
import { Image, Palette, X, Check } from 'lucide-react';
import { ChatAttachment } from '../../types';

interface UploadCardsProps {
  attachments: ChatAttachment[];
  onAttach: (type: 'sketch' | 'brand', file: File, preview: string) => void;
  onRemove: (type: 'sketch' | 'brand') => void;
  onError?: (message: string) => void;
  disabled?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const UploadCards: React.FC<UploadCardsProps> = ({
  attachments,
  onAttach,
  onRemove,
  onError,
  disabled
}) => {
  const sketchInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);

  const sketchAttachment = attachments.find(a => a.type === 'sketch');
  const brandAttachment = attachments.find(a => a.type === 'brand');

  const handleFileSelect = (type: 'sketch' | 'brand', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      onError?.('File too large. Max 10MB.');
      return;
    }

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      onError?.('Invalid file type. Use PNG, JPEG, or WebP.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Only attach if we got a valid result (not empty string)
      if (result && result.trim().length > 0) {
        onAttach(type, file, result);
      }
    };
    reader.readAsDataURL(file);

    // Reset input
    e.target.value = '';
  };

  const handleDrop = (type: 'sketch' | 'brand', e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Validate
    if (file.size > MAX_FILE_SIZE) {
      onError?.('File too large. Max 10MB.');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      onError?.('Invalid file type. Use PNG, JPEG, or WebP.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Only attach if we got a valid result (not empty string)
      if (result && result.trim().length > 0) {
        onAttach(type, file, result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="grid grid-cols-2 gap-3 p-3">
      {/* Sketch/Mockup Upload */}
      <div
        className={`relative group rounded-xl border-2 border-dashed transition-all overflow-hidden ${
          sketchAttachment
            ? 'border-blue-500/50 bg-blue-500/5'
            : 'border-white/10 hover:border-blue-500/30 bg-slate-800/30 hover:bg-slate-800/50'
        } ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onClick={() => !sketchAttachment && sketchInputRef.current?.click()}
        onDrop={(e) => handleDrop('sketch', e)}
        onDragOver={handleDragOver}
      >
        {sketchAttachment ? (
          <>
            {sketchAttachment.preview && sketchAttachment.preview.trim() ? (
              <img
                src={sketchAttachment.preview}
                alt="Sketch"
                className="w-full h-24 object-cover"
              />
            ) : (
              <div className="w-full h-24 bg-slate-800 flex items-center justify-center">
                <Image className="w-10 h-10 text-blue-400" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-medium text-white">Sketch</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove('sketch');
                }}
                className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center gap-2 p-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Image className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-300">Sketch / Mockup</p>
              <p className="text-[10px] text-slate-500">Drop or click</p>
            </div>
          </div>
        )}

        <input
          ref={sketchInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => handleFileSelect('sketch', e)}
          className="hidden"
        />
      </div>

      {/* Brand Logo Upload */}
      <div
        className={`relative group rounded-xl border-2 border-dashed transition-all overflow-hidden ${
          brandAttachment
            ? 'border-purple-500/50 bg-purple-500/5'
            : 'border-white/10 hover:border-purple-500/30 bg-slate-800/30 hover:bg-slate-800/50'
        } ${disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
        onClick={() => !brandAttachment && brandInputRef.current?.click()}
        onDrop={(e) => handleDrop('brand', e)}
        onDragOver={handleDragOver}
      >
        {brandAttachment ? (
          <>
            <div className="w-full h-24 flex items-center justify-center bg-white/5 p-2">
              {brandAttachment.preview && brandAttachment.preview.trim() ? (
                <img
                  src={brandAttachment.preview}
                  alt="Brand"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Palette className="w-10 h-10 text-purple-400" />
                </div>
              )}
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-xs font-medium text-white">Brand</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove('brand');
                }}
                className="w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </>
        ) : (
          <div className="h-24 flex flex-col items-center justify-center gap-2 p-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Palette className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-300">Brand Logo</p>
              <p className="text-[10px] text-slate-500">Optional</p>
            </div>
          </div>
        )}

        <input
          ref={brandInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => handleFileSelect('brand', e)}
          className="hidden"
        />
      </div>
    </div>
  );
};
