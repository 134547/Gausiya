import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

export const A4_CANVAS_WIDTH_PX = 794;

interface ScaledA4ViewportProps {
  children: React.ReactNode;
  /** Width of the virtual A4 sheet in pixels (default 794px = 210mm @ 96dpi) */
  sheetWidth?: number;
  /** Optional ref attached directly to the unscaled inner sheet element (ideal for PDF/PNG capture) */
  sheetRef?: React.Ref<HTMLDivElement>;
  /** Extra classes on the unscaled inner sheet element */
  sheetClassName?: string;
  /** Whether to show a compact Fit / 100% Zoom toggle pill when scaled down on small screens */
  showZoomToggle?: boolean;
  /** Optional controlled zoom mode ('fit' | 'actual') */
  zoomMode?: 'fit' | 'actual';
  onZoomModeChange?: (mode: 'fit' | 'actual') => void;
  /** Extra wrapper classes */
  className?: string;
}

/**
 * Renders an official A4 document at its true desktop/print pixel width (794px)
 * and proportionally scales it to fit phones & tablets cleanly with exact outer height
 * synchronization (zero clipping, zero broken columns, zero whitespace below).
 * During PDF/PNG capture and native browser printing, the inner sheet stays 100% unscaled A4.
 */
export const ScaledA4Viewport: React.FC<ScaledA4ViewportProps> = ({
  children,
  sheetWidth = A4_CANVAS_WIDTH_PX,
  sheetRef,
  sheetClassName = '',
  showZoomToggle = true,
  zoomMode: controlledZoomMode,
  onZoomModeChange,
  className = '',
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(sheetWidth);
  const [naturalHeight, setNaturalHeight] = useState<number>(0);
  const [internalZoomMode, setInternalZoomMode] = useState<'fit' | 'actual'>('fit');

  const zoomMode = controlledZoomMode ?? internalZoomMode;
  const setZoomMode = (next: 'fit' | 'actual') => {
    if (onZoomModeChange) onZoomModeChange(next);
    else setInternalZoomMode(next);
  };

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    const measureOuter = () => {
      const w = outer.clientWidth;
      if (w > 0) setContainerWidth(w);
    };

    measureOuter();
    const ro = new ResizeObserver(measureOuter);
    ro.observe(outer);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;

    const measureInner = () => {
      const h = inner.offsetHeight || inner.scrollHeight;
      if (h > 0) setNaturalHeight(h);
    };

    measureInner();
    const ro = new ResizeObserver(measureInner);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [children]);

  const assignInnerRef = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (!sheetRef) return;
    if (typeof sheetRef === 'function') {
      sheetRef(node);
    } else {
      (sheetRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    }
  };

  const needsScale = containerWidth > 0 && containerWidth < sheetWidth - 2;
  const scale = needsScale && zoomMode === 'fit' ? containerWidth / sheetWidth : 1;
  const scaledHeight = naturalHeight > 0 ? Math.ceil(naturalHeight * scale) : undefined;
  const isCentered = !needsScale && containerWidth > sheetWidth;

  return (
    <div className={`w-full ${className}`}>
      {showZoomToggle && needsScale && (
        <div className="flex items-center justify-between gap-2 mb-2 px-1 no-print">
          <span className="text-[11px] font-medium text-neutral-500">
            A4 Preview ({Math.round(scale * 100)}%)
          </span>
          <div className="inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setZoomMode('fit')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                zoomMode === 'fit'
                  ? 'bg-[#141E30] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Minimize2 className="w-3 h-3" />
              Fit Phone
            </button>
            <button
              type="button"
              onClick={() => setZoomMode('actual')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                zoomMode === 'actual'
                  ? 'bg-[#141E30] text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              <Maximize2 className="w-3 h-3" />
              100%
            </button>
          </div>
        </div>
      )}

      <div
        ref={outerRef}
        className={`a4-scaled-outer w-full ${
          zoomMode === 'actual' && needsScale ? 'overflow-x-auto pb-2' : 'overflow-hidden'
        }`}
        style={
          scale < 1 && scaledHeight
            ? { height: `${scaledHeight}px` }
            : undefined
        }
      >
        <div
          className="a4-scaled-transform-layer"
          style={{
            width: `${sheetWidth}px`,
            marginLeft: isCentered ? 'auto' : undefined,
            marginRight: isCentered ? 'auto' : undefined,
            transform: scale < 1 ? `scale(${scale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          <div
            ref={assignInnerRef}
            className={`a4-paper-canvas bg-white text-[#171717] ${sheetClassName}`}
            style={{ width: `${sheetWidth}px` }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
