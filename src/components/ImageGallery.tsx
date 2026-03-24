import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ZoomIn, Camera, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageItem {
  src: string;
  caption?: string;
}

interface ImageGalleryProps {
  srcs: ImageItem[];
}

export default function ImageGallery({ srcs }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);

  if (srcs.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-red-500/40 bg-gradient-to-b from-red-950/30 via-card/60 to-card/40 backdrop-blur-sm shadow-[0_0_16px_rgba(239,68,68,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]">
        {/* Header */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-gradient-to-b from-red-600/20 via-red-500/8 to-transparent hover:from-red-600/30 transition-all"
        >
          {/* Icon */}
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/30 via-red-600/20 to-red-800/25 border border-red-400/40 flex items-center justify-center shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.3)]">
            <Camera className="w-4 h-4 text-red-400" />
          </div>

          {/* Title */}
          <div className="flex flex-col items-start gap-0.5">
            <span className="text-base font-black tracking-widest uppercase text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)] [.light_&]:text-red-600">
              ⚠ תמונות חשובות
            </span>
            <span className="text-[11px] text-red-300/50 font-medium tracking-wide uppercase">
              Critical Visuals
            </span>
          </div>

          {/* Count badge */}
          <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-400/30 rounded-full px-3 py-1 shadow-[0_0_6px_rgba(239,68,68,0.2)]">
            <Camera className="w-3 h-3 text-red-400" />
            <span className="text-sm font-black text-red-300">
              {srcs.length}
            </span>
            <span className="text-xs text-red-300/60">
              {srcs.length === 1 ? 'תמונה' : 'תמונות'}
            </span>
          </div>

          {/* Expand controls */}
          <div className="mr-auto flex items-center gap-2">
            {expanded && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(0); }}
                title="מסך מלא"
                className="p-1.5 rounded-lg text-red-300/60 hover:text-red-300 hover:bg-red-500/10 transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {expanded
              ? <ChevronUp className="w-4 h-4 text-red-300/60" />
              : <ChevronDown className="w-4 h-4 text-red-300/60" />
            }
          </div>
        </button>

        {/* Grid */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="overflow-hidden"
            >
              <div className={`p-4 grid gap-3 ${srcs.length === 1 ? 'grid-cols-1' : srcs.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                {srcs.map((item, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setLightboxIndex(i)}
                      className="group relative rounded-xl overflow-hidden bg-black/40 aspect-video flex items-center justify-center border border-white/5 hover:border-red-400/40 transition-all duration-200"
                    >
                      <img
                        src={item.src}
                        alt={item.caption || `תמונה ${i + 1}`}
                        className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 backdrop-blur-sm rounded-full p-2.5">
                          <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </button>
                    {/* Caption */}
                    {item.caption && (
                      <p className="text-xs text-center text-red-300/70 font-medium px-1 leading-snug">
                        {item.caption}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={srcs.map(item => ({ src: item.src, title: item.caption }))}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 4, zoomInMultiplier: 1.5 }}
        styles={{ container: { backgroundColor: 'rgba(0,0,0,0.95)' } }}
      />
    </>
  );
}
