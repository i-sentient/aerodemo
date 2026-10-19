import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// ─── THEME CONSTANTS ───
export const theme = {
  colors: {
    accent: '#005FB8',
    light: {
      bg: '#FFFFFF',
      text: '#000000',
      textMuted: '#666666',
      gridLine: 'rgba(0, 0, 0, 0.15)',
      border: '#e5e7eb',
    },
    dark: {
      bg: '#000000',
      text: '#FFFFFF',
      textMuted: '#aaaaaa',
      gridLine: 'rgba(255, 255, 255, 0.18)',
      border: '#333333',
    },
  },
  grid: {
    size: '60px 60px',
    position: 'center center',
  },
  fonts: {
    heading: "'Copperplate Gothic Light', 'Copperplate Light', serif",
    body: "'Inter', sans-serif",
  },
};

// ─── HELPER: Get colors for current mode ───
export const getColors = (darkMode) => darkMode ? theme.colors.dark : theme.colors.light;

// ─── HELPER: Grid background style ───
export const gridBgStyle = (darkMode) => {
  const c = getColors(darkMode);
  return {
    backgroundColor: c.bg,
    backgroundImage: `linear-gradient(${c.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${c.gridLine} 1px, transparent 1px)`,
    backgroundSize: theme.grid.size,
    backgroundPosition: theme.grid.position,
  };
};

// ══════════════════════════════════════════════════════════════
// ─── UNIFIED NAVIGATION HOOK ───
// Every section uses this. Handles keyboard + provides helpers.
//
// totalSlides=1 → single-content section (arrow keys move between sections)
// totalSlides=N → multi-slide section (arrows cycle sub-slides, then move between sections)
// ══════════════════════════════════════════════════════════════
export function useSlideNavigation({ totalSlides = 1, onComplete, onPrevious }) {
  const [currentSlide, setCurrentSlide] = useState(0);

  const canGoNext = currentSlide < totalSlides - 1 || !!onComplete;
  const canGoPrev = currentSlide > 0 || !!onPrevious;

  const nextSlide = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(prev => prev + 1);
    } else if (onComplete) {
      onComplete();
    }
  }, [currentSlide, totalSlides, onComplete]);

  const prevSlide = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    } else if (onPrevious) {
      onPrevious();
    }
  }, [currentSlide, onPrevious]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide]);

  return { currentSlide, nextSlide, prevSlide, canGoNext, canGoPrev };
}

// ─── SLIDE LAYOUT: Full-screen slide with grid background ───
export const SlideLayout = ({ children, darkMode = false, className = '' }) => (
  <div
    className={`w-full h-screen overflow-hidden ${className}`}
    style={{
      ...gridBgStyle(darkMode),
      fontFamily: theme.fonts.body,
      color: getColors(darkMode).text,
    }}
  >
    {children}
  </div>
);

// ─── SLIDE NAVIGATION DOTS (small, for App-level) ───
export const NavDots = ({ count, current, onNavigate, darkMode = false }) => (
  <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px', zIndex: 10 }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        onClick={() => onNavigate(i)}
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: i === current ? theme.colors.accent : (darkMode ? '#666' : '#ccc'),
          cursor: 'pointer',
          transition: 'background-color 0.3s',
        }}
      />
    ))}
  </div>
);

// ─── DARK MODE TOGGLE BUTTON ───
export const DarkModeToggle = ({ darkMode, onToggle }) => (
  <button
    onClick={onToggle}
    style={{
      position: 'absolute',
      top: '20px',
      right: '20px',
      padding: '10px 20px',
      backgroundColor: darkMode ? '#fff' : '#000',
      color: darkMode ? '#000' : '#fff',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: 10,
      transition: 'all 0.3s',
      fontFamily: theme.fonts.body,
    }}
  >
    {darkMode ? '\u2600\uFE0F Light' : '\uD83C\uDF19 Dark'}
  </button>
);

// ─── SUB-SLIDE CONTROLS (for multi-slide sections) ───
export const SlideControls = ({ totalSlides, currentSlide, onPrev, onNext, canGoPrev = true, canGoNext = true }) => (
  <div className="pb-4 flex gap-6 items-center">
    <button
      onClick={onPrev}
      className={`p-3 rounded-full border-2 border-black transition-colors ${!canGoPrev ? 'opacity-20 cursor-not-allowed' : 'hover:bg-black hover:text-white'}`}
    >
      <ChevronLeft size={24} />
    </button>
    <div className="flex gap-2">
      {Array.from({ length: totalSlides }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-6 transition-all ${i === currentSlide ? 'bg-black' : 'bg-gray-300'}`}
        />
      ))}
    </div>
    <button
      onClick={onNext}
      className={`p-3 rounded-full border-2 border-black transition-colors ${!canGoNext ? 'opacity-20 cursor-not-allowed' : 'hover:bg-black hover:text-white'}`}
    >
      <ChevronRight size={24} />
    </button>
  </div>
);

// ─── FLOATING CONTROLS (for fullscreen scrollable slides) ───
export const FloatingSlideControls = ({ onPrev, onNext, canGoPrev = true, canGoNext = true, darkMode = false }) => (
  <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none z-50">
    <div className={`${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200'} backdrop-blur-md p-2 rounded-full shadow-lg pointer-events-auto border`}>
      <div className="flex gap-6 items-center px-4">
        <button
          onClick={onPrev}
          className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'} ${!canGoPrev ? 'opacity-20 cursor-not-allowed' : ''}`}
        >
          <ChevronLeft size={24} className={darkMode ? 'text-white' : 'text-black'} />
        </button>
        <button
          onClick={onNext}
          className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-white/10' : 'hover:bg-black/10'} ${!canGoNext ? 'opacity-20 cursor-not-allowed' : ''}`}
        >
          <ChevronRight size={24} className={darkMode ? 'text-white' : 'text-black'} />
        </button>
      </div>
    </div>
  </div>
);

// ─── SECTION FOOTER (for sub-slide decks) ───
export const SlideFooter = ({ label, currentSlide, totalSlides, darkMode = false }) => (
  <div
    className={`mt-auto pt-6 flex justify-between items-center text-sm font-bold uppercase tracking-widest border-t transition-colors duration-500 ${darkMode ? 'border-white/10 text-slate-400' : 'border-gray-200 text-gray-600'}`}
    style={{ fontFamily: theme.fonts.body }}
  >
    <span>{label}</span>
    <span>Slide {currentSlide + 1} of {totalSlides}</span>
  </div>
);

// ─── RIGHT-EDGE NESTED NAV ───
// Vertical pill on the right edge of the frame for controlling
// nested transitions within a single slide/section.
// The main blue-dot nav at bottom handles section-level navigation.
export const RightEdgeNav = ({ current, total, onNext, onPrev, label, darkMode = false }) => (
  <div className="fixed right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-center gap-3 pointer-events-auto">
    <div className={`${darkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-slate-200/60'} backdrop-blur-md rounded-2xl shadow-xl border p-2 flex flex-col items-center gap-2`}>
      {/* Up / Prev */}
      <button
        onClick={onPrev}
        disabled={current <= 0}
        className={`p-1.5 rounded-lg transition-colors ${current <= 0 ? 'opacity-20 cursor-not-allowed' : (darkMode ? 'hover:bg-slate-800 active:bg-slate-700' : 'hover:bg-slate-100 active:bg-slate-200')}`}
      >
        <ChevronLeft size={16} className={`rotate-90 ${darkMode ? 'text-white' : 'text-slate-600'}`} />
      </button>

      {/* Dot track */}
      <div className="flex flex-col items-center gap-1.5 py-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${i < current
              ? 'w-2 h-2 bg-slate-800'
              : i === current
                ? 'w-2.5 h-2.5 bg-blue-600 ring-2 ring-blue-200'
                : 'w-1.5 h-1.5 bg-slate-300'
              }`}
          />
        ))}
      </div>

      {/* Down / Next */}
      <button
        onClick={onNext}
        className="p-1.5 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"
      >
        <ChevronRight size={16} className="rotate-90" />
      </button>
    </div>

    {/* Label */}
    {label && (
      <div className={`${darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-200/60'} backdrop-blur-sm rounded-lg px-2 py-1 shadow border`}>
        <span className={`text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
      </div>
    )}

    {/* Counter */}
    <div className={`text-[10px] font-semibold ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
      {current}/{total}
    </div>
  </div>
);
