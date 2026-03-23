import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ZoomIn, Image as ImageIcon, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageGalleryProps {
  srcs: string[];
}

export default function ImageGallery({ srcs }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [expanded, setExpanded] = useState(false);

  if (srcs.length === 0) return null;

  return (
    <>
      <div className="rounded-2xl overflow-hidden border border-black/20 bg-gradient-to-b from-card/80 via-card/60 to-card/40 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]">
        {/* Header — always visible, click to expand */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-3 px-5 py-3.5 bg-gradient-to-b from-violet-600/25 via-violet-500/10 to-transparent hover:from-violet-600/35 transition-all"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/25 via-violet-600/15 to-violet-800/20 border border-violet-400/30 flex items-center justify-center shrink-0">
            <ImageIcon className="w-4 h-4 text-violet-400" />
          </div>
          <span className="text-xs font-black text-white tracking-widest uppercase [.light_&]:text-black">
            Critical Visuals
          </span>
          <span className="text-xs text-violet-300/60 font-medium">
            {srcs.length} {srcs.length === 1 ? 'תמונה' : 'תמונות'}
          </span>
          <div className="mr-auto flex items-center gap-2">
            {expanded && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(0); }}
                title="מסך מלא"
                className="p-1.5 rounded-lg text-violet-300/60 hover:text-violet-300 hover:bg-violet-500/10 transition"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {expanded
              ? <ChevronUp className="w-4 h-4 text-violet-300/60" />
              : <ChevronDown className="w-4 h-4 text-violet-300/60" />
            }
          </div>
        </button>

        {/* Tiles grid — only when expanded */}
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
                {srcs.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className="group relative rounded-xl overflow-hidden bg-black/40 aspect-video flex items-center justify-center border border-white/5 hover:border-violet-400/40 transition-all duration-200"
                  >
                    <img
                      src={src}
                      alt={`תמונה ${i + 1}`}
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 backdrop-blur-sm rounded-full p-2.5">
                        <ZoomIn className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  </button>
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
        slides={srcs.map(src => ({ src }))}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 4, zoomInMultiplier: 1.5 }}
        styles={{ container: { backgroundColor: 'rgba(0,0,0,0.95)' } }}
      />
    </>
  );
}
