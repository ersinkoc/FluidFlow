import React, { useState, useEffect } from 'react';
import { X as XIcon, Github, Mail, Star, ExternalLink, Heart, Sparkles, Code, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  title: string;
  description: string;
  logo: string;
  website: string;
  github: string;
  color: string;
}

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showOnFirstLaunch?: boolean;
}

export const CreditsModal: React.FC<CreditsModalProps> = ({ isOpen, onClose, showOnFirstLaunch = false }) => {
  const [hasSeenCredits, setHasSeenCredits] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);

  useEffect(() => {
    // Try to load from GitHub first, fallback to local ads.json
    fetch('https://raw.githubusercontent.com/ersinkoc/ersinkoc/refs/heads/main/ads.json')
      .then(res => res.json())
      .then(data => {
        // Randomly select 3 projects from the list
        const shuffled = [...data].sort(() => 0.5 - Math.random());
        const selectedProjects = shuffled.slice(0, 3);
        setProjects(selectedProjects);
      })
      .catch(() => {
        // Fallback to local ads.json
        fetch('/ads.json')
          .then(res => res.json())
          .then(data => {
            // Randomly select 3 projects from local list
            const shuffled = [...data].sort(() => 0.5 - Math.random());
            const selectedProjects = shuffled.slice(0, 3);
            setProjects(selectedProjects);
          })
          .catch(() => {
            // Final fallback data if both fetches fail
            setProjects([
              {
                id: "tonl",
                name: "TONL",
                title: "Token-Optimized Notation Language",
                description: "A text-first, LLM-friendly serialization format. Up to 50% fewer tokens than JSON. Zero dependencies. Built for the AI era.",
                logo: "🔗",
                website: "https://tonl.dev",
                github: "https://github.com/tonl-dev/tonl",
                color: "from-blue-500/20 to-purple-600/20"
              },
              {
                id: "specpulse",
                name: "SpecPulse",
                title: "Build Software 10x Faster with AI",
                description: "SpecPulse transforms how you build software. Write specifications once, generate intelligent tasks, and let AI handle the implementation.",
                logo: "⚡",
                website: "https://specpulse.xyz",
                github: "https://github.com/specpulse/specpulse",
                color: "from-emerald-500/20 to-blue-600/20"
              }
            ]);
          });
      });
  }, []);

  useEffect(() => {
    // Check if user has seen credits before
    const seen = localStorage.getItem('fluidflow-credits-seen');
    if (seen) {
      setHasSeenCredits(true);
    }

    // Trigger animation on mount
    if (isOpen) {
      setTimeout(() => setIsAnimating(true), 100);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsAnimating(false);
    if (!hasSeenCredits && showOnFirstLaunch) {
      localStorage.setItem('fluidflow-credits-seen', 'true');
      setHasSeenCredits(true);
    }
    setTimeout(onClose, 200);
  };

  const handleGitHubStar = () => {
    window.open('https://github.com/ersinkoc/FluidFlow', '_blank');
  };

  const handleTwitterFollow = () => {
    window.open('https://x.com/ersinkoc', '_blank');
  };

  const handleEmailContact = () => {
    window.open('mailto:ersinkoc@gmail.com', '_blank');
  };

  const nextProject = () => {
    setCurrentProjectIndex((prev) => (prev + 1) % projects.length);
  };

  const prevProject = () => {
    setCurrentProjectIndex((prev) => (prev - 1 + projects.length) % projects.length);
  };

  const currentProject = projects[currentProjectIndex];

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[9999] p-4 transition-all duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`relative max-w-7xl w-full transform transition-all duration-500 ${isAnimating ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-4 opacity-0'}`}>
        {/* Animated background effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20 rounded-3xl blur-xl animate-pulse"></div>

        {/* Main card */}
        <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl overflow-hidden w-full">
          {/* Floating particles background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-10 left-10 text-blue-400/20 animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}>
              <Sparkles size={20} />
            </div>
            <div className="absolute top-20 right-20 text-purple-400/20 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '3s' }}>
              <Code size={16} />
            </div>
            <div className="absolute bottom-10 left-20 text-pink-400/20 animate-bounce" style={{ animationDelay: '1s', animationDuration: '3s' }}>
              <Zap size={18} />
            </div>
            <div className="absolute bottom-20 right-10 text-yellow-400/20 animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '3s' }}>
              <Star size={14} />
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-6 right-6 text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 p-2 rounded-full group z-10"
          >
            <XIcon size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          </button>

          {/* Compact Layout */}
          <div className="space-y-8 text-white/90">
            {/* Main Content - 2 Column */}
            <div className="flex flex-col md:flex-row gap-8">
              {/* Left Column: Project Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="inline-flex items-center justify-center w-20 h-20 mb-4 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg transform hover:scale-110 transition-transform duration-300">
                  <Sparkles size={40} className="text-white" />
                </div>
                <h2 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  FluidFlow
                </h2>
                <p className="text-white/80 text-lg mb-4">AI-Powered Prototyping Revolution</p>
                <p className="text-white/70 text-sm mb-6 leading-relaxed">
                  Transform your sketches and ideas into fully functional React applications with the power of AI.
                  Experience real-time preview and seamless development workflow.
                </p>
                <button
                  onClick={handleGitHubStar}
                  className="flex items-center gap-3 px-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500/20 via-orange-500/20 to-red-500/20 hover:from-yellow-500/30 hover:via-orange-500/30 hover:to-red-500/30 border border-yellow-500/30 transition-all group transform hover:scale-105"
                >
                  <Star className="text-yellow-400 group-hover:fill-yellow-400 group-hover:rotate-180 transition-all duration-500" size={20} />
                  <span className="font-medium">Star on GitHub</span>
                </button>
              </div>

              {/* Right Column: Developer Info */}
              <div className="flex-1">
                <div className="max-w-sm mx-auto">
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-500 to-orange-600 flex items-center justify-center">
                        <span className="text-2xl">👨‍💻</span>
                      </div>
                      <div className="text-left">
                        <h3 className="font-bold text-xl text-white">Ersin KOÇ</h3>
                        <p className="text-white/70">Full-Stack Developer & AI Enthusiast</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 mb-4">
                    <button
                      onClick={handleTwitterFollow}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 hover:border-blue-500/50 transition-all"
                    >
                      <XIcon size={16} className="text-blue-400" />
                      <span className="text-sm font-medium">@ersinkoc</span>
                    </button>
                    <button
                      onClick={handleEmailContact}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 hover:border-green-500/50 transition-all"
                    >
                      <Mail size={16} className="text-green-400" />
                      <span className="text-sm font-medium">Email</span>
                    </button>
                    <button
                      onClick={handleGitHubStar}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50 hover:bg-gray-700/70 border border-gray-600/50 transition-all"
                    >
                      <Github size={16} />
                      <span className="text-sm font-medium">GitHub</span>
                    </button>
                  </div>

                  <div className="text-center">
                    <p className="text-xs text-white/60">
                      Open to collaborations, consulting, and exciting AI projects
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Other Projects - Compact Slider */}
            {projects.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg text-white">More Projects</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={prevProject}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                      disabled={projects.length <= 1}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      onClick={nextProject}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                      disabled={projects.length <= 1}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>

                {currentProject && (
                  <div className={`bg-gradient-to-r ${currentProject.color} rounded-xl p-6 border border-white/20 backdrop-blur-sm h-32`}>
                    <div className="flex items-center gap-4 h-full">
                      <div className="w-16 h-16 rounded-lg bg-white/10 border border-white/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {currentProject.logo.startsWith('https://') ? (
                          <img
                            src={currentProject.logo}
                            alt={currentProject.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Fallback to emoji if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              target.parentElement!.innerHTML = `<span class="text-3xl">📦</span>`;
                            }}
                          />
                        ) : (
                          <span className="text-3xl">{currentProject.logo}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xl font-bold text-white mb-1 truncate">{currentProject.name}</h4>
                        <p className="text-white/80 text-sm mb-2">{currentProject.title}</p>
                        <p className="text-white/70 text-xs leading-relaxed line-clamp-2">{currentProject.description}</p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        <button
                          onClick={() => window.open(currentProject.website, '_blank')}
                          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          onClick={() => window.open(currentProject.github, '_blank')}
                          className="p-2 rounded-lg bg-gray-700/50 hover:bg-gray-700/70 transition-all"
                        >
                          <Github size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Project Indicators */}
                {projects.length > 1 && (
                  <div className="flex justify-center gap-2">
                    {projects.map((project, index) => (
                      <button
                        key={project.id}
                        onClick={() => setCurrentProjectIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentProjectIndex
                            ? 'bg-white scale-125'
                            : 'bg-white/40 hover:bg-white/60'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer - Simple */}
            <div className="text-center text-xs text-white/50">
              <p className="flex items-center justify-center gap-3">
                <span>v1.0.0</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Made with
                  <Heart size={10} className="text-red-400 animate-pulse" />
                  in Estonia
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};