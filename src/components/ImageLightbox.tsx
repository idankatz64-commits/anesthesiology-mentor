import { useEffect, useCallback, RefObject } from "react";
import { X, Download } from "lucide-react";

interface Props {
  src: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, onClose }: Props) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = `image_${Date.now()}.png`;
    a.target = "_blank";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition"
          title="הורד תמונה"
        >
          <Download className="w-3.5 h-3.5" />
          הורד
        </button>
        <button
          onClick={onClose}
          className="p-2 text-white bg-white/10 hover:bg-white/20 rounded-lg border border-white/20 transition"
          title="סגור (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Image */}
      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt="תצוגה מוגדלת"
          className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl"
          style={{ userSelect: "none" }}
        />
      </div>

      {/* Hint */}
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/40">
        לחץ מחוץ לתמונה או Esc לסגירה
      </p>
    </div>
  );
}

/** Hook — attach click-to-lightbox on all <img> elements inside a container,
 *  excluding images inside elements with data-no-lightbox attribute */
export function useImageLightbox(
  containerRef: RefObject<HTMLDivElement>,
  setLightboxSrc: (src: string) => void
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "IMG") return;
      // skip images inside edit mode
      if (target.closest("[data-no-lightbox]")) return;
      const src = (target as HTMLImageElement).src;
      if (src) setLightboxSrc(src);
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [containerRef, setLightboxSrc]);
}
