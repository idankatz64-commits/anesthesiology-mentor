import { useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { ZoomIn, Image as ImageIcon } from 'lucide-react';

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

export default function ImageGallery({ mediaLink, className = '' }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const urls = parseUrls(mediaLink);
  if (urls.length === 0) return null;

  const slides = urls.map(src => ({ src }));

  return (
    <>
      <div className={`glass-card rounded-xl p-4 border border-border ${className}`}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground uppercase tracking-widest">CRITICAL VISUALS</span>
        </div>

        {/* Grid */}
        <div className={`grid gap-3 ${urls.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
          {urls.map((url, i) => (
            <button
              key={url}
              onClick={() => setLightboxIndex(i)}
              className="group relative rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center border border-border/50 hover:border-primary/30 transition-all duration-200"
            >
              <img
                src={url}
                alt={`תמונה ${i + 1}`}
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              {/* Zoom overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center">
                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
              </div>
            </button>
          ))}
        </div>

        <p className="text-[10px] text-muted-foreground mt-2 text-center">לחץ על תמונה להגדלה</p>
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        index={lightboxIndex}
        slides={slides}
        plugins={[Zoom]}
        zoom={{ maxZoomPixelRatio: 4, zoomInMultiplier: 1.5 }}
        styles={{
          container: { backgroundColor: 'rgba(0,0,0,0.92)' },
        }}
      />
    </>
  );
}
