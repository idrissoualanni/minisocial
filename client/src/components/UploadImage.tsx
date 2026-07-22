// ============================================================
// UploadImage.jsx — Upload local + crop obligatoire avant ajout
// ============================================================

import { useRef, useState } from "react";
import ImageCropModal from "./ImageCropModal";

interface UploadImageProps {
  imagePreview: string | null;
  onImageSelect: (dataUrl: string) => void;
  onImageRemove: () => void;
}

export default function UploadImage({ imagePreview, onImageSelect, onImageRemove }: UploadImageProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rawImage, setRawImage] = useState<string | null>(null); // image brute avant crop

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setRawImage(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
    // reset input pour pouvoir re-sélectionner le même fichier
    e.target.value = "";
  };

  const handleCropConfirm = (croppedImage: string) => {
    setRawImage(null);
    onImageSelect(croppedImage);
  };

  const handleCropCancel = () => {
    setRawImage(null);
  };

  return (
    <div className="mt-2">
      {imagePreview ? (
        <div className="relative inline-block rounded-[10px] overflow-hidden max-h-[200px]">
          <img src={imagePreview} alt="Preview" className="block max-w-full max-h-[200px] rounded-[10px] object-cover" />
          <button className="absolute top-[6px] right-[6px] w-6 h-6 rounded-full border-none bg-black/55 text-white cursor-pointer grid place-items-center transition-colors duration-150 hover:bg-red-500" onClick={onImageRemove} title="Retirer l'image">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ) : (
        <button className="flex items-center gap-2 py-2 px-3 rounded-xl bg-transparent text-[0.78rem] font-semibold cursor-pointer transition-all duration-150 w-full" style={{ border: "1px dashed var(--border)", color: "var(--text-tertiary)" }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-soft)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }} onClick={() => inputRef.current?.click()} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>Ajouter une image</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        style={{ display: "none" }}
      />

      {/* Modal de crop — s'ouvre dès qu'une image brute est sélectionnée */}
      {rawImage && (
        <ImageCropModal
          imageSrc={rawImage}
          onCrop={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
