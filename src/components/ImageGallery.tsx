import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ZoomIn, Image as ImageIcon, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';

interface ImageGalleryProps {
  mediaLink: string; // single URL or pipe-separated "url1|||url2"
  className?: string;
}

/** Parse pipe-separated URLs into an array */
function parseUrls(mediaLink: string): string[] {
  return mediaLink
    .split('|||')
    .map(u => u.trim())
    .filter(u => u && u !== 'nan' && u.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i));
}

/** Derive a human-readable label from a URL filename */
function labelFromUrl(url: string): string {
  try {
    const filename = url.split('/').pop()?.split('?')[0] ?? '';
    const name = filename.replace(/\.[^.]+$/, '');
    return name
      .replace(/[-_]/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim();
  } catch {
    return '';
  }
}

export default function ImageGallery({ mediaLink, className = '' }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [collapsed, setCollapsed] = useState(false);

  const urls = parseUrls(mediaLink);
  if (urls.length === 0) return null;

  const slides = urls.map(src => ({ src }));

  return (
    <>
      <div className={`rounded-2xl overflow-hidden border border-black/20 bg-gradient-to-b from-card/80 via-card/60 to-card/40 backdrop-blur-sm shadow-[0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)] ${className}`}>
        {/* Header */}
        <div className="relative flex items-center gap-3 px-5 py-3.5 bg-gradient-to-b from-violet-600/25 via-violet-500/10 to-transparent">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/25 via-violet-600/15 to-violet-800/20 border border-violet-400/30 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-violet-400" />
          </div>
          <span className="text-xs font-black text-white tracking-widest uppercase [.light_&]:text-black">
            Critical Visuals
          </span>
          <span className="text-xs text-violet-300/60 font-medium ml-1">{urls.length} תמונות</span>

          <div className="flex items-center gap-1 mr-auto">
            <button
              onClick={() => setLightboxIndex(0)}
              title="מסך מלא"
              className="p-1.5 rounded-lg text-violet-300/60 hover:text-violet-300 hover:bg-violet-500/10 transition"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'הרחב' : 'מזער'}
              className="p-1.5 rounded-lg text-violet-300/60 hover:text-violet-300 hover:bg-violet-500/10 transition"
            >
              {collapsed
                ? <ChevronDown className="w-3.5 h-3.5" />
                : <ChevronUp className="w-3.5 h-3.5" />
              }
            </button>
          </div>
        </div>

        {/* Grid */}
        {!collapsed && (
          <div className={`p-4 grid gap-3 ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {urls.map((url, i) => {
              const label = labelFromUrl(url);
              return (
                <div key={url} className="flex flex-col gap-1.5">
                  <button
                    onClick={() => setLightboxIndex(i)}
                    className="group relative rounded-xl overflow-hidden bg-black/40 aspect-video flex items-center justify-center border border-white/5 hover:border-violet-400/30 transition-all duration-200"
                  >
                    <img
                      src={url}
                      alt={label || `תמונה ${i + 1}`}
                      className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {/* Zoom overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/60 backdrop-blur-sm rounded-full p-2">
                        <ZoomIn className="w-5 h-5 text-white drop-shadow-lg" />
                      </div>
                    </div>
                  </button>
                  {label && (
                    <p className="text-[11px] text-center text-muted-foreground font-medium tracking-wide px-1">
                      {label}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={slides}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 4, zoomInMultiplier: 1.5 }}
        styles={{ container: { backgroundColor: 'rgba(0,0,0,0.95)' } }}
      />
    </>
  );
}
