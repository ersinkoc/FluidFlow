/**
 * GeneratingOverlay - Engaging loading screen during code generation
 *
 * Shows rotating tips, features, and promotions while waiting.
 */
import React, { useState, useEffect, memo } from 'react';
import {
  Loader2,
  Wand2,
  Bot,
  Eye,
  GitBranch,
  MousePointer2,
  Brain,
  Wrench,
  Smartphone,
  Lightbulb,
  RefreshCw,
  Target,
  MessageSquare,
  Heart,
  Megaphone,
  Sparkles,
  Zap,
  Code2,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { getPromotionCycle, type Promotion } from '../../data/promotions';

// Icon mapping
const ICONS: Record<string, LucideIcon> = {
  Wand2,
  Bot,
  Eye,
  GitBranch,
  MousePointer2,
  Brain,
  Wrench,
  Smartphone,
  Lightbulb,
  RefreshCw,
  Target,
  MessageSquare,
  Heart,
  Megaphone,
  Sparkles,
  Zap,
  Code2,
};

interface GeneratingOverlayProps {
  isGenerating: boolean;
  isFixing?: boolean;
}

export const GeneratingOverlay = memo(function GeneratingOverlay({
  isGenerating,
  isFixing = false,
}: GeneratingOverlayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [promotions] = useState(() => getPromotionCycle());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);

  // Navigate to previous
  const goToPrev = () => {
    setAutoPlay(false); // Stop auto-play when user navigates
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + promotions.length) % promotions.length);
      setIsTransitioning(false);
    }, 150);
  };

  // Navigate to next
  const goToNext = () => {
    setAutoPlay(false); // Stop auto-play when user navigates
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % promotions.length);
      setIsTransitioning(false);
    }, 150);
  };

  // Cycle through promotions (only if autoPlay is enabled)
  useEffect(() => {
    if (!isGenerating) {
      setCurrentIndex(0);
      setAutoPlay(true);
      return;
    }

    if (!autoPlay) return;

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % promotions.length);
        setIsTransitioning(false);
      }, 300);
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, [isGenerating, promotions.length, autoPlay]);

  if (!isGenerating) return null;

  const current = promotions[currentIndex];
  const IconComponent = current.icon ? ICONS[current.icon] || Sparkles : Sparkles;

  // Type-based styling
  const getTypeStyles = (type: Promotion['type']) => {
    switch (type) {
      case 'feature':
        return {
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/20',
          icon: 'text-blue-400',
          title: 'text-blue-300',
          badge: 'bg-blue-500/20 text-blue-300',
          badgeText: 'Feature',
        };
      case 'tip':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20',
          icon: 'text-amber-400',
          title: 'text-amber-300',
          badge: 'bg-amber-500/20 text-amber-300',
          badgeText: 'Pro Tip',
        };
      case 'creator':
        return {
          bg: 'bg-pink-500/10',
          border: 'border-pink-500/20',
          icon: 'text-pink-400',
          title: 'text-pink-300',
          badge: 'bg-pink-500/20 text-pink-300',
          badgeText: 'FluidFlow',
        };
      case 'ad':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20',
          icon: 'text-emerald-400',
          title: 'text-emerald-300',
          badge: 'bg-emerald-500/20 text-emerald-300',
          badgeText: 'Sponsored',
        };
      default:
        return {
          bg: 'bg-slate-500/10',
          border: 'border-slate-500/20',
          icon: 'text-slate-400',
          title: 'text-slate-300',
          badge: 'bg-slate-500/20 text-slate-300',
          badgeText: '',
        };
    }
  };

  const styles = getTypeStyles(current.type);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md">
      {/* Main spinner */}
      <div className="relative mb-8">
        <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-purple-500/20 border-b-purple-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-400 animate-pulse" />
        </div>
      </div>

      {/* Status text */}
      <p className="text-lg font-medium text-blue-300 mb-8 animate-pulse">
        {isFixing ? 'Adapting Layout...' : 'Constructing Interface...'}
      </p>

      {/* Promotion card with navigation */}
      <div className="flex items-center gap-3 max-w-lg mx-4">
        {/* Previous button */}
        <button
          onClick={goToPrev}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all shrink-0"
          title="Previous"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card */}
        <div
          className={`flex-1 p-5 rounded-xl border ${styles.bg} ${styles.border} transition-all duration-300 ${
            isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
          }`}
        >
        {/* Badge */}
        <div className="flex items-center justify-between mb-3">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
            {styles.badgeText}
          </span>
          <div className="flex items-center gap-1">
            {promotions.map((_, i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === currentIndex ? 'bg-white/60 scale-125' : 'bg-white/20'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex gap-4">
          <div className={`w-10 h-10 rounded-lg ${styles.bg} flex items-center justify-center shrink-0`}>
            <IconComponent className={`w-5 h-5 ${styles.icon}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold mb-1 ${styles.title}`}>{current.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{current.description}</p>
            {current.link && (
              <a
                href={current.link}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 mt-2 text-xs ${styles.icon} hover:underline`}
              >
                {current.linkText || 'Learn more'}
                <Zap className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        </div>

        {/* Next button */}
        <button
          onClick={goToNext}
          className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all shrink-0"
          title="Next"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Progress hint */}
      <p className="mt-6 text-xs text-slate-500">
        AI is crafting your interface • This usually takes 10-30 seconds
      </p>
    </div>
  );
});

export default GeneratingOverlay;
