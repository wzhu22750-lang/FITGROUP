import { useEffect } from 'react';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { pushBackHandler } from '../backStack';

interface PhotoSourceSheetProps {
  open: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
}

export default function PhotoSourceSheet({ open, onClose, onCamera, onGallery }: PhotoSourceSheetProps) {
  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => {
      onClose();
      return true;
    });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white border-t-4 border-ink p-4 space-y-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-[10px] font-black uppercase tracking-widest text-ink/40">选择照片来源</p>
        <button
          type="button"
          onClick={onCamera}
          className="w-full bg-neon text-ink border-4 border-ink py-4 font-black uppercase flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <Camera size={20} /> 拍照
        </button>
        <button
          type="button"
          onClick={onGallery}
          className="w-full bg-white text-ink border-4 border-ink py-4 font-black uppercase flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          <ImageIcon size={20} /> 从相册选择
        </button>
        <button
          type="button"
          onClick={onClose}
          className="w-full bg-paper text-ink border-2 border-ink py-3 font-black uppercase flex items-center justify-center gap-2"
        >
          <X size={16} /> 取消
        </button>
      </div>
    </div>
  );
}
