// ============================================================
// ImageCropModal.jsx — Recadrage 100% libre (canvas custom)
// 4 poignées de coin, déplacement, zoom slider
// ============================================================

import { useState, useRef, useCallback, useEffect } from "react";

const HANDLE_SIZE = 14;
const MIN_CROP = 30;

// Convertit data URL → image dimensions
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.src = src;
  });
}

// Dessine l'image + overlay + sélection sur un canvas
function renderFrame(ctx, img, zoom, pan, sel, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  // Fond sombre
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, canvasW, canvasH);

  // Calcul zone image (contain)
  const imgRatio = img.width / img.height;
  const canRatio = canvasW / canvasH;
  let drawW, drawH;
  if (imgRatio > canRatio) {
    drawW = canvasW * zoom;
    drawH = (canvasW / imgRatio) * zoom;
  } else {
    drawH = canvasH * zoom;
    drawW = (canvasH * imgRatio) * zoom;
  }
  const drawX = (canvasW - drawW) / 2 + pan.x;
  const drawY = (canvasH - drawH) / 2 + pan.y;

  // Dessiner l'image
  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Overlay sombre
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  // Haut
  ctx.fillRect(0, 0, canvasW, sel.y);
  // Bas
  ctx.fillRect(0, sel.y + sel.h, canvasW, canvasH - sel.y - sel.h);
  // Gauche
  ctx.fillRect(0, sel.y, sel.x, sel.h);
  // Droite
  ctx.fillRect(sel.x + sel.w, sel.y, canvasW - sel.x - sel.w, sel.h);

  // Bordure sélection
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);

  // Grille rule of thirds
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i++) {
    const lx = sel.x + (sel.w * i) / 3;
    const ly = sel.y + (sel.h * i) / 3;
    ctx.beginPath();
    ctx.moveTo(lx, sel.y);
    ctx.lineTo(lx, sel.y + sel.h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(sel.x, ly);
    ctx.lineTo(sel.x + sel.w, ly);
    ctx.stroke();
  }

  // Poignées de coin
  const corners = getCornerHandles(sel);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  corners.forEach((c) => {
    ctx.beginPath();
    ctx.arc(c.x, c.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}

function getCornerHandles(sel) {
  return [
    { id: "tl", x: sel.x, y: sel.y },
    { id: "tr", x: sel.x + sel.w, y: sel.y },
    { id: "bl", x: sel.x, y: sel.y + sel.h },
    { id: "br", x: sel.x + sel.w, y: sel.y + sel.h },
  ];
}

function hitTest(mx, my, sel) {
  const corners = getCornerHandles(sel);
  for (const c of corners) {
    const dx = mx - c.x;
    const dy = my - c.y;
    if (dx * dx + dy * dy <= (HANDLE_SIZE + 4) * (HANDLE_SIZE + 4)) {
      return c.id;
    }
  }
  // Test inside selection
  if (mx >= sel.x && mx <= sel.x + sel.w && my >= sel.y && my <= sel.y + sel.h) {
    return "move";
  }
  return null;
}

export default function ImageCropModal({ imageSrc, onCrop, onCancel }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const imgRef = useRef(null);
  const rafRef = useRef(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sel, setSel] = useState({ x: 50, y: 50, w: 200, h: 200 });
  const [canvasSize, setCanvasSize] = useState({ w: 560, h: 340 });

  // Drag state
  const dragRef = useRef({ active: false, handle: null, startX: 0, startY: 0, origSel: null });

  // Charger l'image et calculer canvas
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const img = await loadImage(imageSrc);
      if (cancelled) return;
      imgRef.current = img;

      const container = containerRef.current;
      if (!container) return;
      const w = container.clientWidth;
      const h = 340;
      setCanvasSize({ w, h });

      // Centrer la sélection à 60% de la zone
      const sw = Math.min(w * 0.6, 400);
      const sh = Math.min(h * 0.6, 250);
      setSel({
        x: (w - sw) / 2,
        y: (h - sh) / 2,
        w: sw,
        h: sh,
      });
    })();
    return () => { cancelled = true; };
  }, [imageSrc]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    renderFrame(ctx, img, zoom, pan, sel, canvasSize.w, canvasSize.h);
  }, [zoom, pan, sel, canvasSize]);

  // Mouse handlers
  const getPos = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e) => {
    const pos = getPos(e);
    const hit = hitTest(pos.x, pos.y, sel);
    if (!hit) return;
    e.preventDefault();
    dragRef.current = {
      active: true,
      handle: hit,
      startX: pos.x,
      startY: pos.y,
      origSel: { ...sel },
    };
  }, [sel, getPos]);

  const handleMouseMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag.active) {
      // Cursor feedback
      const pos = getPos(e);
      const hit = hitTest(pos.x, pos.y, sel);
      canvasRef.current.style.cursor =
        hit === "tl" || hit === "br" ? "nwse-resize" :
        hit === "tr" || hit === "bl" ? "nesw-resize" :
        hit === "move" ? "grab" : "default";
      return;
    }

    const pos = getPos(e);
    const dx = pos.x - drag.startX;
    const dy = pos.y - drag.startY;
    const o = drag.origSel;
    const { w: cw, h: ch } = canvasSize;

    if (drag.handle === "move") {
      setSel({
        x: Math.max(0, Math.min(cw - o.w, o.x + dx)),
        y: Math.max(0, Math.min(ch - o.h, o.y + dy)),
        w: o.w,
        h: o.h,
      });
      return;
    }

    let newSel = { ...o };

    if (drag.handle.includes("l")) {
      newSel.x = Math.max(0, o.x + dx);
      newSel.w = o.w - (newSel.x - o.x);
    }
    if (drag.handle.includes("r")) {
      newSel.w = Math.max(MIN_CROP, Math.min(cw - o.x, o.w + dx));
    }
    if (drag.handle.includes("t")) {
      newSel.y = Math.max(0, o.y + dy);
      newSel.h = o.h - (newSel.y - o.y);
    }
    if (drag.handle.includes("b")) {
      newSel.h = Math.max(MIN_CROP, Math.min(ch - o.y, o.h + dy));
    }

    // Empêcher taille négative
    if (newSel.w < MIN_CROP) { newSel.w = MIN_CROP; }
    if (newSel.h < MIN_CROP) { newSel.h = MIN_CROP; }

    setSel(newSel);
  }, [sel, canvasSize, getPos]);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Crop final → data URL
  const handleCrop = async () => {
    const img = imgRef.current;
    if (!img) return;

    const { w: cw, h: ch } = canvasSize;
    const imgRatio = img.width / img.height;
    const canRatio = cw / ch;
    let drawW, drawH;
    if (imgRatio > canRatio) {
      drawW = cw * zoom;
      drawH = (cw / imgRatio) * zoom;
    } else {
      drawH = ch * zoom;
      drawW = (ch / imgRatio) * zoom;
    }
    const drawX = (cw - drawW) / 2 + pan.x;
    const drawY = (ch - drawH) / 2 + pan.y;

    // Sélection en coordonnées image
    const scaleX = img.width / drawW;
    const scaleY = img.height / drawH;

    const srcX = (sel.x - drawX) * scaleX;
    const srcY = (sel.y - drawY) * scaleY;
    const srcW = sel.w * scaleX;
    const srcH = sel.h * scaleY;

    // Canvas de sortie (max 1200px)
    const maxDim = 1200;
    let outW = Math.round(srcW);
    let outH = Math.round(srcH);
    if (outW > maxDim || outH > maxDim) {
      const ratio = Math.min(maxDim / outW, maxDim / outH);
      outW = Math.round(outW * ratio);
      outH = Math.round(outH * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    onCrop(canvas.toDataURL("image/jpeg", 0.92));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-[4px] flex items-center justify-center z-[9999]" style={{ animation: "fadeIn 0.15s ease" }} onClick={onCancel}>
      <div className="bg-[var(--surface)] rounded-2xl w-[90vw] max-w-[600px] overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.3)]" style={{ border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between py-3 px-5 font-semibold text-[0.92rem]" style={{ borderBottom: "1px solid var(--border)" }}>
          <span>Recadrer l'image</span>
          <button className="bg-transparent border-none cursor-pointer w-7 h-7 rounded-full grid place-items-center transition-colors duration-150" style={{ color: "var(--text-tertiary)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-sunken)"; e.currentTarget.style.color = "var(--text)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-tertiary)"; }} onClick={onCancel}>✕</button>
        </div>

        <div ref={containerRef} className="relative w-full h-[340px] bg-[#1a1a1a]">
          <canvas
            ref={canvasRef}
            width={canvasSize.w}
            height={canvasSize.h}
            onMouseDown={handleMouseDown}
            className="w-full h-full"
          />
        </div>

        <div className="py-3 px-5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5" style={{ color: "var(--text-tertiary)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
            </svg>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="crop-zoom-slider flex-1 h-1 appearance-none rounded-full outline-none cursor-pointer"
              style={{ background: "var(--border)" }}
            />
            <span className="text-[0.75rem] font-semibold min-w-[32px] text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 py-2.5 px-5" style={{ borderTop: "1px solid var(--border)" }}>
          <button className="btn-cancel" onClick={onCancel}>Annuler</button>
          <button className="btn-primary" onClick={handleCrop}>Appliquer</button>
        </div>
      </div>
    </div>
  );
}
