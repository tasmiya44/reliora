import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { 
  Camera, 
  Upload, 
  Trash2, 
  LogOut, 
  Image as ImageIcon, 
  Loader2, 
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Folder as FolderIcon,
  ChevronRight,
  Maximize2,
  Info,
  Bell,
  Pencil,
  Heart,
  MoreHorizontal,
  Crop,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Wand2,
  Save,
  Home,
  Clock,
  Archive,
  Search,
  Download,
  Calendar,
  Box,
  Sparkles,
  Grid3X3,
  User as UserIcon,
  LockKeyhole,
  Mail,
  Eye,
  EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Types ---
interface Photo {
  key: string;
  url: string;
  thumbUrl: string;
  previewUrl: string;
  size: number;
  lastModified: string;
  isFavorite: boolean;
}

interface UserSession {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: 'user' | 'admin' | 'demo';
  avatar?: string;
  provider?: 'local' | 'google';
}

const DEMO_MODE_MESSAGE = 'Demo Mode: Please login or sign up to upload and manage your own gallery.';
const DEMO_UPSELL_MESSAGE = 'Demo Mode: Please login or sign up to manage your own gallery.';
const APP_SHELL_CLASS = 'mx-auto w-full max-w-[2400px] px-6 sm:px-8 lg:px-10';
const BRAND_NAME = 'Reliora';
const BRAND_TAGLINE = 'Live moments. Relive memories.';
const LANDING_DEMO_IMAGES = [
  '/demo/pic1.webp',
  '/demo/pic2.webp',
  '/demo/pic3.webp',
  '/demo/pic4.webp',
  '/demo/pic5.webp',
  '/demo/pic6.webp',
  '/demo/pic7.webp',
  '/demo/pic8.webp',
  '/demo/pic9.webp',
  '/demo/pic10.webp',
  '/demo/pic11.webp',
  '/demo/pic12.webp',
];
const LANDING_PREVIEW_FOLDERS = ['scenery', 'reezo', 'quotes', 'other'];
const LANDING_PREVIEW_PHOTOS: Photo[] = LANDING_DEMO_IMAGES.map((src, index) => {
  const folder = LANDING_PREVIEW_FOLDERS[index % LANDING_PREVIEW_FOLDERS.length];
  return {
    key: `${folder}/landing-${index + 1}.webp`,
    url: src,
    thumbUrl: src,
    previewUrl: src,
    size: 120 * 1024,
    lastModified: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
    isFavorite: index === 2 || index === 7,
  };
});

type AuthMode = 'login' | 'register';
type GalleryView = 'gallery' | 'collections' | 'favorites' | 'recent' | 'trash';

const readStoredUser = (): UserSession | null => {
  const stored = localStorage.getItem('gallery_user');
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed?.username ? parsed : null;
  } catch {
    return null;
  }
};

const formatCollectionName = (name: string) => {
  if (name === 'all') return 'All Photos';
  if (name === 'favourites') return 'Favorites';
  return name.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
};

const normalizeFolderList = (folders: string[]) => Array.from(
  new Set(folders.map(folder => folder.trim()).filter(Boolean))
);

const getPhotoCollection = (photo: Photo) => photo.key.includes('/') ? photo.key.split('/')[0] : 'All Photos';
const getPhotoFileName = (photo: Photo) => photo.key.split('/').pop() || photo.key;
const photosThisMonth = (photos: Photo[]) => {
  const now = new Date();
  return photos.filter(photo => {
    const date = new Date(photo.lastModified);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;
};
const formatRelativeTime = (value: string) => {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

// --- Components ---

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error', onClose: () => void }) => (
  <motion.div
    initial={{ opacity: 0, y: 50, x: '-50%' }}
    animate={{ opacity: 1, y: 0, x: '-50%' }}
    exit={{ opacity: 0, y: 20, x: '-50%' }}
    className={cn(
      "fixed bottom-8 left-1/2 z-[100] flex items-center gap-3 rounded-2xl border px-6 py-4 shadow-2xl backdrop-blur-xl",
      type === 'success' ? "border-green-500/20 bg-green-500/10 text-green-400" : "border-red-500/20 bg-red-500/10 text-red-400"
    )}
  >
    {type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
    <span className="text-sm font-semibold">{message}</span>
    <button onClick={onClose} className="ml-2 opacity-50 hover:opacity-100">
      <X size={16} />
    </button>
  </motion.div>
);

const ConfirmModal = ({ isOpen, title, message, onConfirm, onClose, loading }: { 
  isOpen: boolean, 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onClose: () => void,
  loading?: boolean
}) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
        >
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <p className="mt-2 text-zinc-400">{message}</p>
          <div className="mt-8 flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition-all hover:bg-red-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Confirm'}
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const PhotoViewModal = ({
  photo,
  onClose,
  onEdit,
  onFavorite,
  onDelete,
}: {
  photo: Photo | null,
  onClose: () => void,
  onEdit: (photo: Photo) => void,
  onFavorite?: (photo: Photo) => void,
  onDelete?: (photo: Photo) => void,
}) => (
  <AnimatePresence>
    {photo && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={onClose}
          className="absolute right-6 top-6 z-20 rounded-full bg-white/10 p-3 text-white backdrop-blur-xl transition-all hover:bg-white/20"
        >
          <X size={24} />
        </motion.button>
        
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="grid max-h-[88vh] w-full max-w-6xl grid-cols-1 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl lg:grid-cols-[1fr_280px]"
        >
          <div className="flex min-h-0 flex-col bg-black">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <button onClick={onClose} className="rounded-xl bg-white/10 p-2 text-zinc-300 hover:bg-white/15 hover:text-white">
                <ChevronRight className="rotate-180" size={18} />
              </button>
              <button className="rounded-xl bg-white/10 p-2 text-zinc-300 hover:bg-white/15 hover:text-white">
                <Maximize2 size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center p-4">
              <img
                src={photo.previewUrl}
                alt={photo.key}
                referrerPolicy="no-referrer"
                className="max-h-[62vh] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto border-t border-white/10 p-3">
              <img src={photo.thumbUrl} alt="" className="h-14 w-20 rounded-lg border border-blue-500 object-cover" referrerPolicy="no-referrer" />
            </div>
          </div>
          <aside className="flex flex-col gap-5 border-l border-white/10 bg-zinc-950 p-5">
            <div>
              <h3 className="text-lg font-black text-white">Photo Details</h3>
              <p className="mt-1 truncate text-sm text-zinc-500">{getPhotoFileName(photo)}</p>
            </div>
            <div className="grid gap-2">
              <button
                onClick={() => onFavorite?.(photo)}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-white/10"
              >
                <Heart size={17} className={photo.isFavorite ? "text-red-400" : ""} fill={photo.isFavorite ? "currentColor" : "none"} />
                {photo.isFavorite ? 'Remove Favorite' : 'Favorite'}
              </button>
              <button
                onClick={() => onEdit(photo)}
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-white/10"
              >
                <Pencil size={17} />
                Edit
              </button>
              <a
                href={photo.url}
                download
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-zinc-200 hover:bg-white/10"
              >
                <Download size={17} />
                Download
              </a>
              <button
                onClick={() => onDelete?.(photo)}
                className="flex items-center gap-3 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-bold text-red-400 hover:bg-red-500/20"
              >
                <Trash2 size={17} />
                Delete
              </button>
            </div>
            <div className="mt-auto space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm">
              {[
                ['Filename', getPhotoFileName(photo)],
                ['Collection', formatCollectionName(getPhotoCollection(photo))],
                ['Uploaded', new Date(photo.lastModified).toLocaleString()],
                ['Size', `${(photo.size / 1024).toFixed(1)} KB`],
                ['Type', getPhotoFileName(photo).split('.').pop()?.toUpperCase() || 'Photo'],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-[90px_1fr] gap-3">
                  <span className="text-zinc-500">{label}</span>
                  <span className="truncate text-zinc-200">{value}</span>
                </div>
              ))}
            </div>
          </aside>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

type EditorTab = 'crop' | 'adjust' | 'filters';
type EditorFilter = 'original' | 'warm' | 'cool' | 'bw' | 'vintage';

const FILTER_STYLES: Record<EditorFilter, string> = {
  original: '',
  warm: 'sepia(0.18) saturate(1.18) hue-rotate(-8deg)',
  cool: 'saturate(1.08) hue-rotate(14deg) brightness(1.02)',
  bw: 'grayscale(1)',
  vintage: 'sepia(0.35) contrast(0.92) saturate(0.85) brightness(1.03)',
};

const PhotoEditorModal = ({
  photo,
  isDemoUser,
  onClose,
  onSaved,
  onDemoSave,
}: {
  photo: Photo | null,
  isDemoUser: boolean,
  onClose: () => void,
  onSaved: () => void,
  onDemoSave: () => void,
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('adjust');
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [filter, setFilter] = useState<EditorFilter>('original');
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(100);
  const [cropHeight, setCropHeight] = useState(100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cropImageWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!photo) return;
    setActiveTab('adjust');
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setFilter('original');
    setCropEnabled(false);
    setCropX(0);
    setCropY(0);
    setCropWidth(100);
    setCropHeight(100);
    setSaving(false);
    setError('');
  }, [photo?.key]);

  if (!photo) return null;

  const cssFilter = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
    FILTER_STYLES[filter],
  ].filter(Boolean).join(' ');

  const reset = () => {
    setRotation(0);
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setFilter('original');
    setCropEnabled(false);
    setCropX(0);
    setCropY(0);
    setCropWidth(100);
    setCropHeight(100);
    setError('');
  };

  const renderEditedBlob = async () => {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.src = isDemoUser ? (photo.previewUrl || photo.url) : `/api/photo-source/${encodeURIComponent(photo.key)}`;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not load image for editing'));
    });

    const sourceX = cropEnabled ? Math.round((cropX / 100) * image.naturalWidth) : 0;
    const sourceY = cropEnabled ? Math.round((cropY / 100) * image.naturalHeight) : 0;
    const sourceWidth = cropEnabled ? Math.round((cropWidth / 100) * image.naturalWidth) : image.naturalWidth;
    const sourceHeight = cropEnabled ? Math.round((cropHeight / 100) * image.naturalHeight) : image.naturalHeight;
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const rotated = normalizedRotation === 90 || normalizedRotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = rotated ? sourceHeight : sourceWidth;
    canvas.height = rotated ? sourceWidth : sourceHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Editor is not available in this browser');

    ctx.filter = cssFilter;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((normalizedRotation * Math.PI) / 180);
    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, -sourceWidth / 2, -sourceHeight / 2, sourceWidth, sourceHeight);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not prepare edited photo')), 'image/jpeg', 0.92);
    });
  };

  const saveCopy = async () => {
    if (isDemoUser) {
      onDemoSave();
      return;
    }

    setSaving(true);
    setError('');
    try {
      const blob = await renderEditedBlob();
      const formData = new FormData();
      formData.append('photo', blob, 'edited-photo.jpg');
      formData.append('originalKey', photo.key);
      await axios.post('/api/photos/edit-copy', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSaved();
      onClose();
    } catch (err) {
      setError('Could not save edited photo. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const tabButton = (tab: EditorTab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
        activeTab === tab ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  );

  const enableManualCrop = () => {
    setCropEnabled(prev => {
      if (prev) return false;
      setCropX(10);
      setCropY(10);
      setCropWidth(80);
      setCropHeight(80);
      return true;
    });
  };

  const updateCropX = (value: number) => setCropX(Math.max(0, Math.min(value, 100 - cropWidth)));
  const updateCropY = (value: number) => setCropY(Math.max(0, Math.min(value, 100 - cropHeight)));
  const updateCropWidth = (value: number) => {
    const next = Math.min(Math.max(10, value), 100 - cropX);
    setCropWidth(next);
    setCropX(prev => Math.min(prev, 100 - next));
  };
  const updateCropHeight = (value: number) => {
    const next = Math.min(Math.max(10, value), 100 - cropY);
    setCropHeight(next);
    setCropY(prev => Math.min(prev, 100 - next));
  };

  const moveCropBox = (clientX: number, clientY: number) => {
    const bounds = cropImageWrapRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const nextX = ((clientX - bounds.left) / bounds.width) * 100 - cropWidth / 2;
    const nextY = ((clientY - bounds.top) / bounds.height) * 100 - cropHeight / 2;
    updateCropX(nextX);
    updateCropY(nextY);
  };

  const startCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    moveCropBox(event.clientX, event.clientY);
  };

  const dragCropBox = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveCropBox(event.clientX, event.clientY);
  };

  const stopCropDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cropControl = (
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (value: number) => void,
  ) => (
    <label className="block">
      <div className="mb-2 flex justify-between text-sm font-bold text-zinc-300">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
    </label>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div>
              <h3 className="text-xl font-black text-white">Edit Photo</h3>
              <p className="text-sm text-zinc-500">Save creates a new copy. Your original stays unchanged.</p>
            </div>
            <button onClick={onClose} className="rounded-xl bg-white/10 p-2 text-zinc-300 hover:bg-white/15 hover:text-white">
              <X size={22} />
            </button>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_360px]">
            <div className="flex min-h-0 items-center justify-center bg-black/40 p-6">
              <div className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div ref={cropImageWrapRef} className="relative inline-block max-h-full max-w-full">
                  <img
                    src={photo.previewUrl}
                    alt={photo.key}
                    referrerPolicy="no-referrer"
                    style={{ filter: cssFilter, transform: `rotate(${rotation}deg)` }}
                    className="block max-h-[68vh] max-w-full object-contain transition-all duration-200"
                  />
                  {cropEnabled && (
                    <div
                      onPointerDown={startCropDrag}
                      onPointerMove={dragCropBox}
                      onPointerUp={stopCropDrag}
                      onPointerCancel={stopCropDrag}
                      className="absolute touch-none cursor-move border-[3px] border-blue-400 shadow-[inset_0_0_0_9999px_rgba(0,0,0,0.22)]"
                      style={{
                        left: `${cropX}%`,
                        top: `${cropY}%`,
                        width: `${cropWidth}%`,
                        height: `${cropHeight}%`,
                      }}
                    >
                      <div className="absolute inset-0 border border-white/70" />
                      <div className="absolute left-1/3 top-0 h-full border-l border-white/35" />
                      <div className="absolute left-2/3 top-0 h-full border-l border-white/35" />
                      <div className="absolute left-0 top-1/3 w-full border-t border-white/35" />
                      <div className="absolute left-0 top-2/3 w-full border-t border-white/35" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <aside className="flex min-h-0 flex-col border-l border-white/10 bg-zinc-950/50 p-5">
              <div className="flex flex-wrap gap-2">
                {tabButton('crop', 'Crop', <Crop size={16} />)}
                {tabButton('adjust', 'Adjust', <SlidersHorizontal size={16} />)}
                {tabButton('filters', 'Filters', <Wand2 size={16} />)}
              </div>

              <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
                {activeTab === 'crop' && (
                  <div className="space-y-4">
                    <button
                      onClick={enableManualCrop}
                      className={cn(
                        "w-full rounded-xl border px-4 py-3 text-left text-sm font-bold transition-all",
                        cropEnabled ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
                      )}
                    >
                      Manual crop
                    </button>
                    {cropEnabled && (
                      <div className="space-y-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                        {cropControl('Left', cropX, 0, 100 - cropWidth, updateCropX)}
                        {cropControl('Top', cropY, 0, 100 - cropHeight, updateCropY)}
                        {cropControl('Width', cropWidth, 10, 100 - cropX, updateCropWidth)}
                        {cropControl('Height', cropHeight, 10, 100 - cropY, updateCropHeight)}
                      </div>
                    )}
                    <p className="text-sm text-zinc-500">Turn on manual crop, adjust the crop box, then save a new copy.</p>
                  </div>
                )}

                {activeTab === 'adjust' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setRotation(prev => prev - 90)} className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800">
                        <RotateCcw size={17} />
                        Left
                      </button>
                      <button onClick={() => setRotation(prev => prev + 90)} className="flex items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white hover:bg-zinc-800">
                        <RotateCw size={17} />
                        Right
                      </button>
                    </div>

                    {[
                      ['Brightness', brightness, setBrightness, 50, 150],
                      ['Contrast', contrast, setContrast, 50, 150],
                      ['Saturation', saturation, setSaturation, 0, 180],
                    ].map(([label, value, setter, min, max]) => (
                      <label key={label as string} className="block">
                        <div className="mb-2 flex justify-between text-sm font-bold text-zinc-300">
                          <span>{label as string}</span>
                          <span>{value as number}%</span>
                        </div>
                        <input
                          type="range"
                          min={min as number}
                          max={max as number}
                          value={value as number}
                          onChange={(e) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(e.target.value))}
                          className="w-full accent-blue-500"
                        />
                      </label>
                    ))}
                  </div>
                )}

                {activeTab === 'filters' && (
                  <div className="grid grid-cols-1 gap-3">
                    {[
                      ['original', 'Original'],
                      ['warm', 'Warm'],
                      ['cool', 'Cool'],
                      ['bw', 'Black & White'],
                      ['vintage', 'Vintage'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setFilter(value as EditorFilter)}
                        className={cn(
                          "rounded-xl border px-4 py-3 text-left text-sm font-bold transition-all",
                          filter === value ? "border-blue-500 bg-blue-500/10 text-blue-300" : "border-white/10 bg-black/20 text-zinc-300 hover:bg-white/5"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm font-semibold text-red-400">
                    {error}
                  </div>
                )}
              </div>

              <div className="mt-6 grid grid-cols-[1fr_1fr_1.35fr] gap-3 border-t border-white/10 pt-4">
                <button onClick={onClose} disabled={saving} className="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700 disabled:opacity-50">
                  Cancel
                </button>
                <button onClick={reset} disabled={saving} className="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white hover:bg-zinc-700 disabled:opacity-50">
                  Reset
                </button>
                <button onClick={saveCopy} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:opacity-50">
                  {saving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}
                  Save as Copy
                </button>
              </div>
            </aside>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const Navbar = ({ user, onLogout }: { user: UserSession | null, onLogout: () => void }) => (
  <nav className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/70 backdrop-blur-xl">
    <div className="flex h-16 items-center justify-between px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg shadow-blue-500/20">
          <Camera size={24} />
        </div>
        <span className="text-xl font-black tracking-tight text-white">{BRAND_NAME}</span>
        <span className="ml-3 hidden text-sm text-zinc-400 md:inline">{BRAND_TAGLINE}</span>
      </div>

      {user && (
        <div className="hidden w-full max-w-md items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-zinc-500 md:flex">
          <Search size={17} />
          <span className="text-sm">Search photos, collections...</span>
          <span className="ml-auto rounded-md bg-white/5 px-2 py-0.5 text-xs text-zinc-400">⌘ K</span>
        </div>
      )}
      
      {user && (
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-medium text-zinc-400 sm:block">
            Welcome, <span className="text-white">{user.name || user.username}</span>
            {user.role === 'demo' && <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-blue-400">Demo</span>}
          </span>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      )}
    </div>
  </nav>
);

const Sidebar = ({
  isDemoUser,
  activeView,
  onNavigate,
  onLogin,
  onSignUp,
  isExpanded,
  onExpandedChange,
}: {
  isDemoUser: boolean,
  activeView: GalleryView,
  onNavigate: (view: GalleryView) => void,
  onLogin: () => void,
  onSignUp: () => void,
  isExpanded: boolean,
  onExpandedChange: (expanded: boolean) => void,
}) => {
  return (
    <aside
      className={cn(
        "fixed left-0 top-[64px] z-40 hidden h-[calc(100vh-64px)] overflow-y-auto border-r border-white/10 bg-black/80 p-3 backdrop-blur-xl transition-[width] duration-300 lg:block",
        isExpanded ? "w-64" : "w-[76px]"
      )}
    >
      <button
        onClick={() => onExpandedChange(!isExpanded)}
        aria-label={isExpanded ? 'Collapse sidebar' : 'Open sidebar'}
        className="mb-4 flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ChevronRight className={cn("transition-transform duration-300", isExpanded && "rotate-180")} size={20} />
      </button>

      <div className="space-y-1">
        {[
          ['gallery', 'Gallery', Home],
          ['collections', 'Collections', FolderIcon],
          ['favorites', 'Favorites', Heart],
          ['recent', 'Recent', Clock],
          ['trash', 'Trash', Archive],
        ].map(([view, label, Icon]) => {
          const LucideIcon = Icon as typeof Home;
          return (
            <button
              key={label as string}
              onClick={() => onNavigate(view as GalleryView)}
              title={!isExpanded ? label as string : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
                !isExpanded && "justify-center px-0",
                activeView === view ? "bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-500/15" : "text-zinc-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <LucideIcon size={18} />
              {isExpanded && <span>{label as string}</span>}
            </button>
          );
        })}
      </div>

      {isDemoUser && isExpanded && (
        <div className="mt-8 rounded-2xl border border-white/10 bg-zinc-950/80 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Sparkles size={16} />
            Demo Mode
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Explore Reliora in demo mode. Create your own gallery to unlock uploads, editing, and collection management.
          </p>
          <div className="mt-5 grid gap-2">
            <button onClick={onLogin} className="rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm font-bold text-zinc-200 hover:bg-white/5">
              Login
            </button>
            <button onClick={onSignUp} className="rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20">
              Sign Up
            </button>
          </div>
        </div>
      )}
    </aside>
  );
};

const StatCard = ({ label, value, icon }: { label: string, value: number | string, icon: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-black/20">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
        {icon}
      </div>
      <div>
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-2xl font-black text-white">{value}</p>
      </div>
    </div>
  </div>
);

const LoginForm = ({ onLoginSuccess, initialMode = 'login', onModeChange }: {
  onLoginSuccess: (token: string, user: UserSession) => void,
  initialMode?: AuthMode,
  onModeChange?: (mode: AuthMode) => void
}) => {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const authBackgroundPhotos = [
  "/demo/pic1.webp",
  "/demo/pic2.webp",
  "/demo/pic5.webp",
  "/demo/pic6.webp",
  "/demo/pic7.webp",
  "/demo/pic8.webp",
  "/demo/pic9.webp",
  "/demo/pic10.webp",
  "/demo/pic11.webp",
  "/demo/pic12.webp",
  "/demo/pic13.webp",
  "/demo/pic14.webp",
  "/demo/pic15.webp",
  "/demo/pic16.webp",
  "/demo/pic17.webp",
  "/demo/pic18.webp",
  "/demo/pic19.webp",
];
  const googleClientConfigured = Boolean((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID);
  const updateMode = (nextMode: AuthMode) => {
    setError('');
    setMode(nextMode);
    onModeChange?.(nextMode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = mode === 'login'
        ? { username, password }
        : { name, email, username, password, confirmPassword };
      const res = await axios.post(mode === 'login' ? '/api/login' : '/api/register', payload);
      onLoginSuccess(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/demo-login');
      onLoginSuccess(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Demo login failed.');
    } finally {
      setDemoLoading(false);
    }
  };

  const handleGoogleLogin = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('Google sign-in failed. Please try again.');
      return;
    }
    setGoogleLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/google-auth', { credential: credentialResponse.credential });
      onLoginSuccess(res.data.token, res.data.user);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[calc(100svh-96px)] w-full items-center justify-center overflow-hidden bg-[#050505] px-3 py-6 sm:px-5 sm:py-8">
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] blur-[2px]">
        <div className="grid h-full grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:px-16">
          {authBackgroundPhotos.map((photoSrc, index) => (
  <div
    key={`auth-bg-${index}`}
    className={cn(
      "overflow-hidden rounded-[2rem] bg-zinc-900 shadow-2xl shadow-black/60",
      index % 3 === 0 ? "translate-y-10" : index % 3 === 1 ? "-translate-y-5" : "translate-y-2"
    )}
  >
    <img
      src={photoSrc}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full min-h-48 w-full object-cover"
    />
  </div>
))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.06),transparent_40%),linear-gradient(to_bottom,rgba(5,5,5,0.78),#050505_82%)]" />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md space-y-5 rounded-[24px] border border-white/[0.08] bg-[rgba(15,15,15,0.85)] p-5 shadow-2xl shadow-black/60 backdrop-blur-xl transition-all duration-300 hover:border-blue-500/20 hover:shadow-blue-500/10 sm:p-7"
      >
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{mode === 'login' ? 'Sign In' : 'Create Account'}</h2>
          <p className="mt-2 text-sm text-zinc-400">{mode === 'login' ? 'Access your Reliora gallery' : 'Start your private Reliora gallery'}</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-3.5">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-zinc-300">Full Name</label>
                  <div className="relative mt-2">
                    <UserIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={19} />
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
	                      className="block h-12 w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/60 focus:bg-black/55 focus:ring-4 focus:ring-blue-500/10"
                      placeholder="Full name"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300">Email</label>
                  <div className="relative mt-2">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={19} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
	                      className="block h-12 w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/60 focus:bg-black/55 focus:ring-4 focus:ring-blue-500/10"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-zinc-300">{mode === 'login' ? 'Username or Email' : 'Username'}</label>
              <div className="relative mt-2">
                <UserIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={19} />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
	                  className="block h-12 w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/60 focus:bg-black/55 focus:ring-4 focus:ring-blue-500/10"
                  placeholder={mode === 'login' ? 'Username or email' : 'Username'}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300">Password</label>
              <div className="relative mt-2">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={19} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
	                  className="block h-12 w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-11 pr-12 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/60 focus:bg-black/55 focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            {mode === 'register' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300">Confirm Password</label>
                <div className="relative mt-2">
                  <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={19} />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
	                    className="block h-12 w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-11 pr-12 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-blue-500/60 focus:bg-black/55 focus:ring-4 focus:ring-blue-500/10"
                    placeholder="Confirm password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-3 text-sm font-medium text-zinc-200">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="h-5 w-5 rounded-md border border-white/20 bg-black/40 text-blue-600 focus:ring-2 focus:ring-blue-500/30"
            />
            Show Password
          </label>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
	            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 via-blue-600 to-blue-500 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition-all hover:brightness-110 focus:outline-none focus:ring-4 focus:ring-blue-500/20 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : (mode === 'login' ? 'Login' : 'Register')}
          </button>
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">OR</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <div
            onClick={() => {
              if (!googleClientConfigured) setError('Google sign-in is not configured yet. Add VITE_GOOGLE_CLIENT_ID to your environment.');
            }}
            className={cn(
	              "relative flex h-12 w-full cursor-pointer items-center justify-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] text-sm font-semibold text-white transition-all hover:border-white/20 hover:bg-white/[0.06]",
              googleLoading && "pointer-events-none opacity-60"
            )}
          >
            <span className="absolute left-5 text-lg font-black text-blue-400">G</span>
            Continue with Google
            {googleClientConfigured && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0">
              <GoogleLogin
                text="continue_with"
                theme="filled_black"
                shape="rectangular"
                width="520"
                onSuccess={handleGoogleLogin}
                onError={() => setError('Google sign-in failed. Please try again.')}
              />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={demoLoading || loading || googleLoading}
	            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] text-sm font-semibold text-zinc-200 transition-all hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white disabled:opacity-50"
          >
            {demoLoading ? <Loader2 className="animate-spin" size={18} /> : <><Sparkles size={17} /> Try Demo</>}
          </button>
          <button
            type="button"
            onClick={() => {
              updateMode(mode === 'login' ? 'register' : 'login');
            }}
            className="w-full pt-2 text-center text-sm font-medium text-zinc-400 transition-colors hover:text-blue-300"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already have an account? Login'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const UploadModal = ({ isOpen, onClose, onUploadSuccess, availableFolders, photos, isDemoUser, onDemoRestriction, onDemoUploadBlocked }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onUploadSuccess: () => void,
  availableFolders: string[],
  photos: Photo[],
  isDemoUser: boolean,
  onDemoRestriction: () => void,
  onDemoUploadBlocked?: () => void
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [folder, setFolder] = useState(availableFolders[0] || 'other');
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);

  useEffect(() => {
    if (availableFolders.length > 0 && !availableFolders.includes(folder)) {
      setFolder(availableFolders[0]);
    }
  }, [availableFolders]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []) as File[];
    if (selected.length > 0) {
      setFiles(selected);
      const firstFile = selected[0];
      if (!firstFile) return;
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(firstFile);
    }
  };

  const checkDuplicate = () => {
    if (files.length === 0) return false;
    return files.some(file => photos.some(p => p.key === `${folder}/${file.name}`));
  };

  const getUniqueFileName = (originalName: string, folder: string) => {
    const dotIndex = originalName.lastIndexOf('.');
    const baseName = dotIndex !== -1 ? originalName.substring(0, dotIndex) : originalName;
    const extension = dotIndex !== -1 ? originalName.substring(dotIndex) : '';
    
    let counter = 1;
    let newName = originalName;
    while (photos.some(p => p.key === `${folder}/${newName}`)) {
      newName = `${baseName}(${counter})${extension}`;
      counter++;
    }
    return newName;
  };

  const handleUpload = async (forceDuplicate = false) => {
    if (files.length === 0) return;

    if (isDemoUser) {
      onDemoUploadBlocked?.() ?? onDemoRestriction();
      return;
    }

    if (!forceDuplicate && checkDuplicate()) {
      setShowDuplicateConfirm(true);
      return;
    }

    setUploading(true);
    setError('');
    
    try {
      for (const selectedFile of files) {
        const finalFileName = forceDuplicate ? getUniqueFileName(selectedFile.name, folder) : selectedFile.name;
        const formData = new FormData();
        const fileToUpload = forceDuplicate
          ? new File([selectedFile], finalFileName, { type: selectedFile.type })
          : selectedFile;

        formData.append('photo', fileToUpload);
        formData.append('folder', folder);

        await axios.post('/api/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }
      onUploadSuccess();
      onClose();
      setFiles([]);
      setPreview(null);
      setShowDuplicateConfirm(false);
    } catch (err: any) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl"
      >
        <AnimatePresence mode="wait">
          {showDuplicateConfirm ? (
            <motion.div
              key="duplicate-confirm"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="p-8 text-center"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-bold text-white">Duplicate Detected</h3>
              <p className="mt-2 text-zinc-400">
                This photo already exists in the <span className="font-bold text-white capitalize">"{formatCollectionName(folder)}"</span> collection. Do you want to create a duplicate?
              </p>
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={() => handleUpload(true)}
                  disabled={uploading}
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="animate-spin" size={18} /> : 'Create Duplicate'}
                </button>
                <button
                  onClick={() => setShowDuplicateConfirm(false)}
                  disabled={uploading}
                  className="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-700 disabled:opacity-50"
                >
                  Cancel Upload
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="upload-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="flex items-center justify-between border-b border-white/10 p-4">
                <h3 className="text-lg font-semibold text-white">Upload Photos</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6">
                {!preview ? (
                  <label className="flex h-64 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-black/20 transition-colors hover:bg-black/40">
                    <div className="flex flex-col items-center justify-center pb-6 pt-5">
                      <Upload className="mb-4 text-zinc-500" size={40} />
                      <p className="mb-2 text-sm text-zinc-400">
                        <span className="font-semibold text-blue-500">Click to upload</span> or drag and drop
                      </p>
                      <p className="text-xs text-zinc-500">PNG, JPG or GIF (MAX. 10MB)</p>
                    </div>
                    <input type="file" className="hidden" onChange={handleFileChange} accept="image/*" multiple />
                  </label>
                ) : (
                  <div className="relative h-64 w-full overflow-hidden rounded-xl bg-black">
                    <img src={preview} alt="Preview" className="h-full w-full object-contain" />
                    <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-3 py-1 text-xs font-bold text-white backdrop-blur-md">
                      {files.length} {files.length === 1 ? 'photo' : 'photos'} selected
                    </div>
                    <button 
                      onClick={() => { setFiles([]); setPreview(null); }}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-md hover:bg-black/70"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Select Collection</label>
                  <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-1">
                    {availableFolders.map((f) => (
                      <button
                        key={f}
                        onClick={() => setFolder(f)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs font-medium capitalize transition-all",
                          folder === f 
                            ? "border-blue-500 bg-blue-500/10 text-blue-400" 
                            : "border-white/10 bg-black/20 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                        )}
                      >
                        {formatCollectionName(f)}
                      </button>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-500 border border-red-500/20">
                    <AlertCircle size={16} />
                    {error}
                  </div>
                )}

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 rounded-lg bg-zinc-800 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpload(false)}
                    disabled={files.length === 0 || uploading}
                    className="flex flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 className="animate-spin" size={18} /> : 'Upload'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

const LandingOverlay = ({ onLoginSuccess }: { onLoginSuccess: (token: string, user: UserSession) => void }) => {
  const [previewPhotos, setPreviewPhotos] = useState<Photo[]>(LANDING_PREVIEW_PHOTOS);
  const [previewFolders, setPreviewFolders] = useState<string[]>(LANDING_PREVIEW_FOLDERS);
  const [previewFolder, setPreviewFolder] = useState('all');
  const [previewActiveView, setPreviewActiveView] = useState<GalleryView>('gallery');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [landingDismissed, setLandingDismissed] = useState(false);
  const [previewSelectedPhotos, setPreviewSelectedPhotos] = useState<string[]>([]);
  const [previewViewingPhoto, setPreviewViewingPhoto] = useState<Photo | null>(null);
  const [previewEditingPhoto, setPreviewEditingPhoto] = useState<Photo | null>(null);
  const [landingToast, setLandingToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [isPreviewActionsMenuOpen, setIsPreviewActionsMenuOpen] = useState(false);
  const [previewCollectionMenu, setPreviewCollectionMenu] = useState<{ x: number, y: number, folder: string } | null>(null);
  const [previewSidebarExpanded, setPreviewSidebarExpanded] = useState(false);
  const [hasLoadedLivePreview, setHasLoadedLivePreview] = useState(false);
  const [isLoadingLivePreview, setIsLoadingLivePreview] = useState(false);
  const galleryRef = React.useRef<HTMLDivElement | null>(null);
  const authRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    LANDING_DEMO_IMAGES.forEach(src => {
      const image = new Image();
      image.decoding = 'async';
      image.src = src;
    });
  }, []);

  const loadLiveDemoPreview = React.useCallback(async () => {
    if (hasLoadedLivePreview || isLoadingLivePreview) return;
    setIsLoadingLivePreview(true);
    try {
      const res = await axios.get('/api/public/demo-preview');
      const nextPhotos = res.data.photos || [];
      const nextFolders = res.data.folders || [];
      if (nextPhotos.length > 0) setPreviewPhotos(nextPhotos);
      if (nextFolders.length > 0) setPreviewFolders(nextFolders);
      setHasLoadedLivePreview(true);
    } catch {
      setHasLoadedLivePreview(false);
    } finally {
      setIsLoadingLivePreview(false);
    }
  }, [hasLoadedLivePreview, isLoadingLivePreview]);

  useEffect(() => {
    if (sessionStorage.getItem('cloudgallery-open-auth') !== 'true') return;
    sessionStorage.removeItem('cloudgallery-open-auth');
    setLandingDismissed(true);
    setAuthMode('login');
    setTimeout(() => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  }, []);

  useEffect(() => {
    const closePreviewMenus = () => {
      setIsPreviewActionsMenuOpen(false);
      setPreviewCollectionMenu(null);
    };
    window.addEventListener('click', closePreviewMenus);
    return () => window.removeEventListener('click', closePreviewMenus);
  }, []);

  const hasPreviewFavorites = previewPhotos.some(photo => photo.isFavorite);
  const previewRealFolders = previewFolders.filter(folder => !['all', 'favourites', 'favorites'].includes(folder.toLowerCase()));
  const previewFilterTabs = ['all', ...(hasPreviewFavorites ? ['favourites'] : []), ...previewRealFolders];
  const previewVisiblePhotos = previewActiveView === 'trash'
    ? []
    : previewActiveView === 'recent'
      ? [...previewPhotos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      : previewActiveView === 'favorites'
        ? previewPhotos.filter(photo => photo.isFavorite)
        : previewPhotos;
  const previewFolderPhotos = previewVisiblePhotos.filter(photo => {
    if (previewActiveView === 'recent' || previewActiveView === 'trash' || previewActiveView === 'favorites') return true;
    if (previewFolder === 'all') return true;
    if (previewFolder === 'favourites') return photo.isFavorite;
    return photo.key.startsWith(`${previewFolder}/`);
  });

  const previewFolderThumbnails = React.useMemo(() => {
    const thumbs: Record<string, string> = {};
    if (previewPhotos.length > 0) {
      const latest = [...previewPhotos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0];
      thumbs.all = latest.thumbUrl;
    }
    previewRealFolders.forEach(folder => {
      const folderPhotos = previewPhotos.filter(photo => photo.key.startsWith(`${folder}/`));
      if (folderPhotos.length > 0) {
        const latest = [...folderPhotos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0];
        thumbs[folder] = latest.thumbUrl;
      }
    });
    return thumbs;
  }, [previewPhotos, previewFolders]);
  const previewRecentPhotos = [...previewPhotos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()).slice(0, 6);
  const previewCollectionCards = previewRealFolders.map(collection => {
    const collectionPhotos = previewPhotos.filter(photo => photo.key.startsWith(`${collection}/`));
    return {
      name: collection,
      count: collectionPhotos.length,
      cover: previewFolderThumbnails[collection] || collectionPhotos[0]?.thumbUrl,
    };
  });
  const previewSelectedCollectionName = previewActiveView === 'trash'
    ? 'Trash'
    : previewActiveView === 'recent'
      ? 'Recent'
      : previewActiveView === 'favorites'
        ? 'Favorites'
        : previewActiveView === 'collections'
          ? 'Collections'
          : formatCollectionName(previewFolder);
  const showPreviewDashboardSections = previewActiveView === 'gallery' && previewFolder === 'all';
  const isPreviewCollectionsView = previewActiveView === 'collections';
  const canPreviewGoBackToGallery = previewActiveView !== 'gallery' || previewFolder !== 'all';

  const scrollPreviewToTop = () => {
    requestAnimationFrame(() => {
      galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const navigatePreviewSidebar = (view: GalleryView) => {
    setPreviewActiveView(view);
    setPreviewSelectedPhotos([]);
    if (view === 'favorites') setPreviewFolder('favourites');
    if (view === 'gallery' || view === 'collections') setPreviewFolder('all');
    scrollPreviewToTop();
  };

  const returnPreviewToGallery = () => {
    setPreviewActiveView('gallery');
    setPreviewFolder('all');
    setPreviewSelectedPhotos([]);
    scrollPreviewToTop();
  };

  const showLandingRestrictionWarning = (message = DEMO_UPSELL_MESSAGE) => {
    setLandingToast({ message, type: 'error' });
    setTimeout(() => setLandingToast(null), 3000);
  };

  const togglePreviewSelection = (key: string) => {
    setPreviewSelectedPhotos(prev =>
      prev.includes(key) ? prev.filter(selectedKey => selectedKey !== key) : [...prev, key]
    );
  };

  const handlePreviewSelectAll = () => {
    setPreviewSelectedPhotos(previewFolderPhotos.map(photo => photo.key));
  };

  const handlePreviewDeselectAll = () => {
    setPreviewSelectedPhotos([]);
  };

  const exploreGallery = () => {
    setLandingDismissed(true);
    void loadLiveDemoPreview();
    requestAnimationFrame(() => {
      galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setTimeout(() => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const showAuthForPreviewMutation = (message = DEMO_UPSELL_MESSAGE) => {
    showLandingRestrictionWarning(message);
    setTimeout(() => openAuth('login'), 120);
  };

  return (
    <div className="relative -mx-6 -mt-8 overflow-hidden pb-24 sm:-mx-8 lg:-mx-10">
      <section className="relative min-h-[calc(100vh-64px)] overflow-hidden">
        <div ref={galleryRef} className="flex min-h-[calc(100vh-64px)] opacity-85">
          <Sidebar
            isDemoUser
            activeView={previewActiveView}
            onNavigate={navigatePreviewSidebar}
            onLogin={() => openAuth('login')}
            onSignUp={() => openAuth('register')}
            isExpanded={previewSidebarExpanded}
            onExpandedChange={setPreviewSidebarExpanded}
          />
          <div className={cn(
            "min-w-0 flex-1 space-y-8 px-6 py-8 transition-[padding-left] duration-300 sm:px-8 lg:px-10",
            previewSidebarExpanded ? "lg:pl-[296px]" : "lg:pl-[116px]"
          )}>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 shadow-2xl shadow-black/20">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Explore Reliora
                  </h1>
                  <p className="mt-2 text-zinc-400">
                    Browse collections, favorites, and memories before creating your own gallery.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => showAuthForPreviewMutation('Create your own gallery to upload and manage photos.')}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition-all hover:brightness-110 active:scale-95"
                    >
                      <Plus size={18} />
                      Upload Photos
                    </button>
                    <button
                      onClick={() => showAuthForPreviewMutation()}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold text-zinc-200 transition-all hover:bg-white/5"
                    >
                      <Box size={18} />
                      Create Collection
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[660px]">
                  <StatCard label="Photos" value={previewPhotos.length} icon={<ImageIcon size={21} />} />
                  <StatCard label="Collections" value={previewRealFolders.length} icon={<FolderIcon size={21} />} />
                  <StatCard label="Favorites" value={previewPhotos.filter(photo => photo.isFavorite).length} icon={<Heart size={21} />} />
                  <StatCard label="This Month" value={photosThisMonth(previewPhotos)} icon={<Calendar size={21} />} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 border-b border-white/5 pb-8 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex-1 min-w-0">
                {canPreviewGoBackToGallery && (
                  <button
                    onClick={returnPreviewToGallery}
                    className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
                  >
                    <ChevronRight className="rotate-180" size={16} />
                    Back to Gallery
                  </button>
                )}
                <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{previewSelectedCollectionName}</h2>
                <p className="mt-2 text-sm font-medium text-zinc-500">
                  {previewFolderPhotos.length} {previewFolderPhotos.length === 1 ? 'photo' : 'photos'}
                </p>
              <AnimatePresence>
                {previewSelectedPhotos.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    className="mt-6 flex flex-wrap items-center gap-3"
                  >
                    <button
                      onClick={handlePreviewSelectAll}
                      className="text-xs font-bold uppercase tracking-widest text-zinc-500 transition-colors hover:text-blue-500"
                    >
                      Select All
                    </button>
                    <span className="text-zinc-800">•</span>
                    <button
                      onClick={handlePreviewDeselectAll}
                      className="text-xs font-bold uppercase tracking-widest text-zinc-500 transition-colors hover:text-red-500"
                    >
                      Deselect All
                    </button>
                    <span className="text-zinc-800">•</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-500">
                      {previewSelectedPhotos.length} {previewSelectedPhotos.length === 1 ? 'photo' : 'photos'} selected
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-8">
              {previewSelectedPhotos.length > 0 ? (
                <motion.div
                  key="preview-bulk-actions"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex flex-wrap items-center gap-2"
                >
                  <button
                    onClick={() => showAuthForPreviewMutation()}
                    className="flex items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-600/10 px-5 py-3 text-sm font-bold text-blue-500 transition-all hover:bg-blue-600 hover:text-white"
                  >
                    <FolderIcon size={18} />
                    Move
                  </button>
                  <button
                    onClick={() => showAuthForPreviewMutation()}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-600/10 px-5 py-3 text-sm font-bold text-red-400 transition-all hover:bg-red-600 hover:text-white"
                  >
                    <Heart size={18} />
                    Favorite
                  </button>
                  <button
                    onClick={() => showAuthForPreviewMutation()}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-600/10 px-5 py-3 text-sm font-bold text-red-500 transition-all hover:bg-red-600 hover:text-white"
                  >
                    <Trash2 size={18} />
                    Delete
                  </button>
                </motion.div>
              ) : (
                <>
                  <button
                    onClick={() => showAuthForPreviewMutation('Create your own gallery to upload and manage photos.')}
                    className="flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-black shadow-2xl shadow-white/10 transition-all hover:bg-zinc-200 active:scale-95"
                  >
                    <Plus size={18} />
                    Upload Photos
                  </button>
                </>
              )}
            </div>
          </div>

          {showPreviewDashboardSections && previewRecentPhotos.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-black text-white">
                  <Clock size={18} />
                  Recently Added
                </h3>
                <button
                  onClick={() => {
                    setPreviewActiveView('recent');
                    setPreviewFolder('all');
                    setPreviewSelectedPhotos([]);
                  }}
                  className="text-sm font-bold text-blue-400 hover:text-blue-300"
                >
                  View all
                </button>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {previewRecentPhotos.map(photo => (
                  <button
                    key={`preview-recent-${photo.key}`}
                    onClick={() => setPreviewViewingPhoto(photo)}
                    className="group relative h-32 w-56 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 text-left"
                  >
                    <img src={photo.thumbUrl} alt={photo.key} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <span className="absolute bottom-3 left-3 text-xs font-bold text-white">{formatRelativeTime(photo.lastModified)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {(showPreviewDashboardSections || isPreviewCollectionsView) && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-black text-white">
                <FolderIcon size={18} />
                Your Collections
              </h3>
              <button
                onClick={() => {
                  setPreviewActiveView('collections');
                  setPreviewFolder('all');
                  setPreviewSelectedPhotos([]);
                }}
                className="text-sm font-bold text-blue-400 hover:text-blue-300"
              >
                View all
              </button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
              {previewCollectionCards.map(collection => (
                <div
                  key={`preview-collection-${collection.name}`}
                  onClick={() => {
                    setPreviewActiveView('gallery');
                    setPreviewFolder(collection.name);
                    setPreviewSelectedPhotos([]);
                  }}
                  className={cn(
                    "group overflow-hidden rounded-2xl border bg-white/[0.04] p-2 text-left transition-all hover:border-blue-500/40 hover:bg-white/[0.06]",
                    previewActiveView === 'gallery' && previewFolder === collection.name ? "border-blue-500 shadow-lg shadow-blue-500/15" : "border-white/10"
                  )}
                >
                  <div className="aspect-[1.45] overflow-hidden rounded-xl bg-zinc-900">
                    {collection.cover ? (
                      <img src={collection.cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-600">
                        <FolderIcon size={28} />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between px-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewActiveView('gallery');
                        setPreviewFolder(collection.name);
                        setPreviewSelectedPhotos([]);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-bold text-white">{formatCollectionName(collection.name)}</p>
                      <p className="text-sm text-zinc-500">{collection.count}</p>
                    </button>
                    <button
                      type="button"
                      aria-label={`${formatCollectionName(collection.name)} collection actions`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewCollectionMenu({ x: e.clientX, y: e.clientY, folder: collection.name });
                      }}
                      className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                onClick={() => showAuthForPreviewMutation()}
                className="flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-blue-500/40 hover:text-white"
              >
                <Plus size={26} />
                <span className="mt-2 text-sm font-bold">Create Collection</span>
              </button>
            </div>
          </section>
          )}

          {!isPreviewCollectionsView && (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-3 lg:pb-0">
              {previewFilterTabs.map(folder => (
                <button
                  key={folder}
                  onClick={() => {
                    setPreviewActiveView(folder === 'favourites' ? 'favorites' : 'gallery');
                    setPreviewFolder(folder);
                    setPreviewSelectedPhotos([]);
                  }}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-xl pl-1.5 pr-4 py-1.5 text-sm font-medium capitalize transition-all",
                    (previewActiveView === 'gallery' || (folder === 'favourites' && previewActiveView === 'favorites')) && previewFolder === folder
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                >
                  {folder === 'favourites' ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-500">
                      <Heart size={14} fill="currentColor" />
                    </div>
                  ) : previewFolderThumbnails[folder] ? (
                    <img
                      src={previewFolderThumbnails[folder]}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-8 w-8 rounded-lg border border-white/10 object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                      <FolderIcon size={14} className="opacity-60" />
                    </div>
                  )}
                  {formatCollectionName(folder)}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3">
              <input
                readOnly
                placeholder="Search photos..."
                className="h-11 w-full max-w-xs rounded-xl border border-white/10 bg-black/40 px-4 text-sm font-medium text-zinc-400 outline-none transition-colors placeholder:text-zinc-600 focus:border-blue-500/40 lg:w-64"
              />
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsPreviewActionsMenuOpen(prev => !prev);
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400 transition-all hover:bg-zinc-800 hover:text-white"
                  aria-label="Gallery actions"
                >
                  <MoreHorizontal size={20} />
                </button>
                <AnimatePresence>
                  {isPreviewActionsMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 top-12 z-40 w-48 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
                    >
                      <button
                        onClick={() => {
                          setIsPreviewActionsMenuOpen(false);
                          showAuthForPreviewMutation();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <FolderIcon size={15} />
                        Create Collection
                      </button>
                      <button
                        onClick={() => {
                          setIsPreviewActionsMenuOpen(false);
                          showAuthForPreviewMutation();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        <Pencil size={15} />
                        Rename Collection
                      </button>
                      <button
                        onClick={() => {
                          setIsPreviewActionsMenuOpen(false);
                          showAuthForPreviewMutation();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 size={15} />
                        Delete Collection
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          )}

          {!isPreviewCollectionsView && previewFolderPhotos.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-6 2xl:grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
            {previewFolderPhotos.slice(0, 18).map(photo => (
              <div key={photo.key} className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50">
                <div
                  role="button"
                  aria-label={previewSelectedPhotos.includes(photo.key) ? `Deselect ${photo.key}` : `Select ${photo.key}`}
                  onClick={() => togglePreviewSelection(photo.key)}
                  className={cn(
                    "absolute left-4 top-4 z-10 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border-2 transition-all",
                    previewSelectedPhotos.includes(photo.key)
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-white/20 bg-black/20 opacity-0 group-hover:opacity-100"
                  )}
                >
                  {previewSelectedPhotos.includes(photo.key) && <CheckCircle2 size={14} />}
                </div>
                <div className={cn(
                  "absolute right-4 top-4 z-10 transition-all duration-300",
                  photo.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}>
                  <button
                    aria-label={photo.isFavorite ? `Remove ${photo.key} from favorites` : `Add ${photo.key} to favorites`}
                    onClick={(e) => {
                      e.stopPropagation();
                      showAuthForPreviewMutation();
                    }}
                    className={cn(
                      "rounded-full p-2 backdrop-blur-md transition-all hover:scale-110",
                      photo.isFavorite ? "bg-white/20 text-white" : "bg-black/20 text-white hover:bg-white/20"
                    )}
                  >
                    <Heart size={16} fill={photo.isFavorite ? "white" : "none"} />
                  </button>
                </div>
                <div className="absolute right-4 top-16 z-10 opacity-0 transition-all duration-300 group-hover:opacity-100">
                  <button
                    aria-label={`Preview ${photo.key}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewViewingPhoto(photo);
                    }}
                    className="rounded-full bg-black/20 p-2 text-white backdrop-blur-md hover:bg-white/20"
                  >
                    <Maximize2 size={16} />
                  </button>
                </div>
                <img
                  src={photo.thumbUrl}
                  alt={photo.key}
                  loading={LANDING_DEMO_IMAGES.includes(photo.thumbUrl) ? "eager" : "lazy"}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onClick={() => previewSelectedPhotos.length > 0 ? togglePreviewSelection(photo.key) : setPreviewViewingPhoto(photo)}
                  className="h-full w-full cursor-pointer object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div
                  onClick={() => previewSelectedPhotos.length > 0 ? togglePreviewSelection(photo.key) : setPreviewViewingPhoto(photo)}
                  className="absolute inset-0 cursor-pointer bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <div className="absolute bottom-0 left-0 right-0 translate-y-2 p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white">{photo.key.split('/').pop()}</p>
                      <p className="text-[10px] text-zinc-400">
                        {(photo.size / 1024).toFixed(1)} KB • {new Date(photo.lastModified).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      aria-label={`Delete ${photo.key}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        showAuthForPreviewMutation();
                      }}
                      className="rounded-lg bg-red-500/20 p-2 text-red-500 backdrop-blur-md transition-colors hover:bg-red-500 hover:text-white"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
          {!isPreviewCollectionsView && previewFolderPhotos.length === 0 && (
            <div className="flex h-80 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-white/5 bg-zinc-900/20 p-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-500">
                {previewActiveView === 'favorites' ? <Heart size={32} fill="currentColor" /> : <ImageIcon size={32} />}
              </div>
              <h3 className="text-xl font-semibold text-white">
                {previewActiveView === 'trash'
                  ? 'Trash is empty.'
                  : previewActiveView === 'favorites'
                    ? 'No favorite photos yet'
                    : 'This collection is empty.'}
              </h3>
            </div>
          )}
          </div>
        </div>

        <AnimatePresence>
          {previewCollectionMenu && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              style={{ top: previewCollectionMenu.y, left: previewCollectionMenu.x }}
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[100] min-w-[210px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
            >
              {[
                ['Rename Collection', Pencil],
                ['Delete Collection', Trash2],
                ['Set Cover Photo', ImageIcon],
                ['Select Multiple', CheckCircle2],
              ].map(([label, Icon]) => {
                const MenuIcon = Icon as typeof Pencil;
                return (
                  <button
                    key={label as string}
                    onClick={() => {
                      if (label === 'Select Multiple') {
                        setPreviewActiveView('gallery');
                        setPreviewFolder(previewCollectionMenu.folder);
                        setPreviewSelectedPhotos(previewPhotos.filter(photo => photo.key.startsWith(`${previewCollectionMenu.folder}/`)).map(photo => photo.key));
                        setPreviewCollectionMenu(null);
                        return;
                      }
                      setPreviewCollectionMenu(null);
                      showAuthForPreviewMutation();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 hover:text-white",
                      label === 'Delete Collection' ? "text-red-400 hover:bg-red-500/10 hover:text-red-300" : "text-zinc-300"
                    )}
                  >
                    <MenuIcon size={14} />
                    {label as string}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!landingDismissed && (
            <motion.div
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -80, transition: { duration: 0.35 } }}
              className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[68vh] min-h-[520px] border-b border-white/15 bg-black/55 shadow-[0_40px_120px_rgba(37,99,235,0.18)] backdrop-blur-2xl"
              style={{
                borderBottomLeftRadius: '50% 22%',
                borderBottomRightRadius: '50% 22%',
              }}
            >
              <div className={cn(APP_SHELL_CLASS, "pointer-events-auto flex h-full flex-col items-center justify-center text-center")}>
                <div className="max-w-4xl">
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-blue-300">Private Cloud Gallery</p>
                  <h2 className="mt-5 text-5xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
                    Welcome to {BRAND_NAME}
                  </h2>
                  <p className="mx-auto mt-5 max-w-2xl text-lg font-medium text-zinc-300 sm:text-xl">
                    {BRAND_TAGLINE}
                  </p>
                  <p className="mx-auto mt-3 max-w-2xl text-base font-medium text-zinc-400 sm:text-lg">
                    Organize, edit, revisit, and cherish your memories in one place.
                  </p>
                  <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                    <button
                      onClick={() => openAuth('login')}
                      className="w-full rounded-xl bg-white px-6 py-3 text-sm font-black text-black shadow-xl shadow-white/10 transition-all hover:bg-zinc-200 active:scale-95 sm:w-auto"
                    >
                      Login
                    </button>
                    <button
                      onClick={() => openAuth('register')}
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur-xl transition-all hover:bg-white/15 sm:w-auto"
                    >
                      Sign Up
                    </button>
                    <button
                      onClick={exploreGallery}
                      className="w-full rounded-xl border border-blue-500/30 bg-blue-500/10 px-6 py-3 text-sm font-bold text-blue-200 transition-all hover:bg-blue-500/20 sm:w-auto"
                    >
                      Explore Demo
                    </button>
                  </div>
                </div>
                <button
                  onClick={exploreGallery}
                  className="absolute bottom-10 flex flex-col items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 transition-colors hover:text-white"
                >
                  <ChevronRight className="rotate-90" size={20} />
                  Scroll to explore demo
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <section ref={authRef} className={cn(APP_SHELL_CLASS, "pt-8 lg:pl-[116px]")}>
        <LoginForm onLoginSuccess={onLoginSuccess} initialMode={authMode} onModeChange={setAuthMode} />
      </section>

      <PhotoViewModal
        photo={previewViewingPhoto}
        onClose={() => setPreviewViewingPhoto(null)}
        onEdit={(photo) => {
          setPreviewViewingPhoto(null);
          setPreviewEditingPhoto(photo);
        }}
        onFavorite={() => showAuthForPreviewMutation()}
        onDelete={() => showAuthForPreviewMutation()}
      />

      <PhotoEditorModal
        photo={previewEditingPhoto}
        isDemoUser
        onClose={() => setPreviewEditingPhoto(null)}
        onSaved={() => undefined}
        onDemoSave={() => showLandingRestrictionWarning('Create your own gallery to save edited photos.')}
      />

      <AnimatePresence>
        {landingToast && (
          <Toast message={landingToast.message} type={landingToast.type} onClose={() => setLandingToast(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<UserSession | null>(readStoredUser());
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [trashPhotos, setTrashPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [error, setError] = useState('');
  const [configStatus, setConfigStatus] = useState<{ isConfigured: boolean, config: any } | null>(null);
  const [activeFolder, setActiveFolder] = useState<string>('all');
  const [activeView, setActiveView] = useState<GalleryView>('gallery');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isBulkMoveModalOpen, setIsBulkMoveModalOpen] = useState(false);
  const [bulkMoveTargetFolder, setBulkMoveTargetFolder] = useState('');
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, folder: string } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [managingDemoGallery, setManagingDemoGallery] = useState(false);
  const [collectionCovers, setCollectionCovers] = useState<Record<string, string>>({});
  const [collectionMenu, setCollectionMenu] = useState<{ x: number, y: number, folder: string } | null>(null);
  const [coverPickerFolder, setCoverPickerFolder] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const mainContentRef = useRef<HTMLElement | null>(null);
  const createFolderRequestRef = useRef(false);

  const isAdminUser = user?.role === 'admin';
  const isDemoUser = user?.role === 'demo';
  const isMutationBlocked = isDemoUser && !managingDemoGallery;
  const isVirtualFolder = (folder: string) => folder === 'all' || folder === 'favourites';
  const hasFavoritePhotos = photos.some(photo => photo.isFavorite);
  const realFolders = availableFolders.filter(folder => !['all', 'favourites', 'favorites'].includes(folder.toLowerCase()));
  const galleryFilterTabs = ['all', ...(hasFavoritePhotos ? ['favourites'] : []), ...realFolders];

  useEffect(() => {
    if (!galleryFilterTabs.includes(activeFolder)) {
      setActiveFolder('all');
    }
  }, [activeFolder, galleryFilterTabs.join('|')]);

  const showDemoRestrictionWarning = () => showToast(DEMO_UPSELL_MESSAGE, 'error');
  const showDemoUploadBlocked = () => {
    showToast('Create your own gallery to upload and manage photos.', 'error');
    setIsUploadOpen(false);
    sessionStorage.setItem('cloudgallery-open-auth', 'true');
    setTimeout(() => {
      handleLogout();
    }, 900);
  };

  const folderThumbnails = React.useMemo(() => {
    const thumbs: Record<string, string> = {};
    
    // For 'all'
    if (photos.length > 0) {
      const latest = [...photos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0];
      thumbs['all'] = latest.thumbUrl;
    }

    realFolders.forEach(folder => {
      if (collectionCovers[folder]) {
        thumbs[folder] = collectionCovers[folder];
        return;
      }
      const folderPhotos = photos.filter(p => p.key.startsWith(`${folder}/`));
      if (folderPhotos.length > 0) {
        const latest = folderPhotos.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())[0];
        thumbs[folder] = latest.thumbUrl;
      }
    });
    
    return thumbs;
  }, [photos, realFolders, collectionCovers]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const checkConfig = async () => {
    try {
      const res = await axios.get('/api/config-status');
      setConfigStatus(res.data);
    } catch (err) {
      console.error('Failed to check config:', err);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await axios.get('/api/folders');
      setAvailableFolders(normalizeFolderList(res.data || []));
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  };

  const fetchCollectionCovers = async () => {
    try {
      const res = await axios.get('/api/folders/covers');
      setCollectionCovers(res.data || {});
    } catch (err) {
      setCollectionCovers({});
    }
  };

  const fetchPhotos = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/api/photos');
      setPhotos(res.data);
    } catch (err: any) {
      console.error(err);
      setError('Could not load your gallery. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTrashPhotos = async () => {
    if (!user) return;
    try {
      const res = await axios.get('/api/photos/trash');
      setTrashPhotos(res.data);
    } catch (err) {
      setTrashPhotos([]);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('gallery_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    
    // Add interceptor to handle token expiration/invalidity
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 || (error.response?.status === 400 && error.response?.data?.message === 'Invalid token')) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    checkConfig();
    if (user) {
      fetchPhotos();
      fetchFolders();
      fetchCollectionCovers();
      fetchTrashPhotos();
    }

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [user]);

  useEffect(() => {
    if (managingDemoGallery) {
      axios.defaults.headers.common['X-Manage-Demo'] = 'true';
    } else {
      delete axios.defaults.headers.common['X-Manage-Demo'];
    }
    if (user) {
      fetchPhotos();
      fetchFolders();
      fetchCollectionCovers();
      fetchTrashPhotos();
    }
  }, [managingDemoGallery]);

  const handleCreateFolder = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (createFolderRequestRef.current || isCreatingFolder) return;
    const folderName = newFolderName.trim();
    if (!folderName) return;
    createFolderRequestRef.current = true;
    setIsCreatingFolder(true);
    try {
      const res = await axios.post('/api/folders', { folder: folderName });
      setAvailableFolders(normalizeFolderList(res.data || []));
      setNewFolderName('');
      setIsCreateFolderOpen(false);
      showToast(`Collection "${folderName}" created`);
    } catch (err) {
      showToast('Could not create collection. Please try again.', 'error');
    } finally {
      createFolderRequestRef.current = false;
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = (folder: string) => {
    if (isVirtualFolder(folder)) {
      showToast('Select a real collection before deleting.', 'error');
      return;
    }
    setFolderToDelete(folder);
  };

  const handleDeleteFolderConfirm = async (mode: 'empty' | 'move' | 'delete' = 'empty') => {
    if (!folderToDelete) return;
    if (isMutationBlocked) return showDemoRestrictionWarning();
    setIsDeletingFolder(true);
    try {
      await axios.delete(`/api/folders/${folderToDelete}`, { params: { mode } });
      setAvailableFolders(prev => prev.filter(f => f !== folderToDelete));
      if (activeFolder === folderToDelete) setActiveFolder('all');
      showToast(
        mode === 'move'
          ? `Collection "${formatCollectionName(folderToDelete)}" deleted. Photos moved to All Photos.`
          : `Collection "${formatCollectionName(folderToDelete)}" deleted`
      );
      setFolderToDelete(null);
      await fetchFolders();
      await fetchPhotos();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not delete collection. Please try again.', 'error');
    } finally {
      setIsDeletingFolder(false);
    }
  };

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setIsActionsMenuOpen(false);
      setCollectionMenu(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, folder: string) => {
    if (folder === 'all' || folder === 'favourites') return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      folder
    });
  };

  const handleLoginSuccess = (token: string, nextUser: UserSession) => {
    localStorage.setItem('gallery_token', token);
    localStorage.setItem('gallery_user', JSON.stringify(nextUser));
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(nextUser);
  };

  const handleLogout = async () => {
    await axios.post('/api/logout');
    localStorage.removeItem('gallery_token');
    localStorage.removeItem('gallery_user');
    delete axios.defaults.headers.common['Authorization'];
    delete axios.defaults.headers.common['X-Manage-Demo'];
    setManagingDemoGallery(false);
    setUser(null);
    setPhotos([]);
    setTrashPhotos([]);
    setCollectionCovers({});
    setActiveView('gallery');
    showToast('Logged out successfully');
  };

  const handleDelete = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (!confirmDelete) return;
    setIsDeleting(true);
    try {
      await axios.delete(`/api/photo/${encodeURIComponent(confirmDelete)}`);
      setPhotos(photos.filter(p => p.key !== confirmDelete));
      await fetchTrashPhotos();
      showToast('Photo deleted successfully');
      setConfirmDelete(null);
    } catch (err) {
      showToast('Could not delete photo. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMove = async (sourceKey: string, targetFolder: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    try {
      await axios.post('/api/move', { sourceKey, targetFolder });
      await fetchPhotos();
      showToast(`Moved to ${formatCollectionName(targetFolder)}`);
    } catch (err: any) {
      showToast('Could not move photo. Please try again.', 'error');
    }
  };

  const toggleFavorite = async (key: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    try {
      const res = await axios.post('/api/photos/favorite', { key });
      setPhotos(prev => prev.map(p => p.key === key ? { ...p, isFavorite: res.data.isFavorite } : p));
      showToast(res.data.isFavorite ? 'Added to Favorites' : 'Removed from Favorites');
    } catch (err) {
      showToast('Could not update favorites. Please try again.', 'error');
    }
  };

  const handleBulkFavorite = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (selectedPhotos.length === 0) return;
    try {
      const selectedSet = new Set(selectedPhotos);
      const selectedUnfavorited = photos.filter(p => selectedSet.has(p.key) && !p.isFavorite);
      for (const photo of selectedUnfavorited) {
        await axios.post('/api/photos/favorite', { key: photo.key });
      }
      setPhotos(prev => prev.map(p => selectedSet.has(p.key) ? { ...p, isFavorite: true } : p));
      showToast(`${selectedPhotos.length} ${selectedPhotos.length === 1 ? 'photo' : 'photos'} added to Favorites`);
    } catch (err) {
      showToast('Could not update favorites. Please try again.', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (selectedPhotos.length === 0) return;
    setIsDeleting(true);
    try {
      const deletedCount = selectedPhotos.length;
      await axios.post('/api/photos/bulk-delete', { keys: selectedPhotos });
      setPhotos(photos.filter(p => !selectedPhotos.includes(p.key)));
      setSelectedPhotos([]);
      await fetchTrashPhotos();
      showToast(`${deletedCount} ${deletedCount === 1 ? 'photo' : 'photos'} moved to Trash`);
      setIsBulkDeleteConfirmOpen(false);
    } catch (err) {
      showToast('Could not delete photos. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestorePhoto = async (key: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    try {
      await axios.post('/api/photo/restore', { key });
      setSelectedPhotos(prev => prev.filter(selectedKey => selectedKey !== key));
      await fetchPhotos();
      await fetchTrashPhotos();
      showToast('Photo restored');
    } catch (err) {
      showToast('Could not restore photo. Please try again.', 'error');
    }
  };

  const handlePermanentDeletePhoto = async (key: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    try {
      await axios.delete(`/api/photo/permanent/${encodeURIComponent(key)}`);
      setTrashPhotos(prev => prev.filter(photo => photo.key !== key));
      setSelectedPhotos(prev => prev.filter(selectedKey => selectedKey !== key));
      showToast('Photo permanently deleted');
    } catch (err) {
      showToast('Could not permanently delete photo. Please try again.', 'error');
    }
  };

  const handleBulkRestore = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (selectedPhotos.length === 0) return;
    setIsDeleting(true);
    try {
      const restoredCount = selectedPhotos.length;
      for (const key of selectedPhotos) {
        await axios.post('/api/photo/restore', { key });
      }
      setSelectedPhotos([]);
      await fetchPhotos();
      await fetchTrashPhotos();
      showToast(`${restoredCount} ${restoredCount === 1 ? 'photo' : 'photos'} restored`);
    } catch (err) {
      showToast('Could not restore selected photos. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (selectedPhotos.length === 0) return;
    setIsDeleting(true);
    try {
      const deletedCount = selectedPhotos.length;
      for (const key of selectedPhotos) {
        await axios.delete(`/api/photo/permanent/${encodeURIComponent(key)}`);
      }
      setTrashPhotos(prev => prev.filter(photo => !selectedPhotos.includes(photo.key)));
      setSelectedPhotos([]);
      setIsBulkDeleteConfirmOpen(false);
      showToast(`${deletedCount} ${deletedCount === 1 ? 'photo' : 'photos'} permanently deleted`);
    } catch (err) {
      showToast('Could not permanently delete selected photos. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkMove = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (selectedPhotos.length === 0 || !bulkMoveTargetFolder) return;
    setIsBulkMoving(true);
    try {
      await axios.post('/api/photos/bulk-move', { 
        keys: selectedPhotos, 
        targetFolder: bulkMoveTargetFolder 
      });
      setSelectedPhotos([]);
      setIsBulkMoveModalOpen(false);
      setBulkMoveTargetFolder('');
      showToast(`${selectedPhotos.length} photos moved to ${formatCollectionName(bulkMoveTargetFolder)}`);
      await fetchPhotos();
    } catch (err) {
      showToast('Could not move photos. Please try again.', 'error');
    } finally {
      setIsBulkMoving(false);
    }
  };

  const handleSetCoverPhoto = async (photoKey: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (isVirtualFolder(activeFolder) || activeView !== 'gallery') {
      showToast('Open a collection before setting its cover.', 'error');
      return;
    }
    try {
      await axios.post('/api/folders/cover', { folder: activeFolder, key: photoKey });
      await fetchCollectionCovers();
      showToast('Collection cover updated');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not update collection cover. Please try again.', 'error');
    }
  };

  const handleSetCollectionCover = async (folder: string, photoKey: string) => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (isVirtualFolder(folder)) {
      showToast('Select a real collection before setting its cover.', 'error');
      return;
    }
    try {
      await axios.post('/api/folders/cover', { folder, key: photoKey });
      await fetchCollectionCovers();
      setCoverPickerFolder(null);
      showToast('Collection cover updated');
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not update collection cover. Please try again.', 'error');
    }
  };

  const handleRenameFolder = async () => {
    if (isMutationBlocked) return showDemoRestrictionWarning();
    if (!folderToRename || !renameValue.trim()) return;
    if (isVirtualFolder(folderToRename)) {
      showToast('Select a real collection before renaming.', 'error');
      return;
    }
    setIsRenaming(true);
    try {
      await axios.post('/api/folders/rename', { 
        oldName: folderToRename, 
        newName: renameValue 
      });
      setAvailableFolders(prev => prev.map(f => f === folderToRename ? renameValue.toLowerCase().trim() : f));
      if (activeFolder === folderToRename) setActiveFolder(renameValue.toLowerCase().trim());
      showToast(`Collection renamed to "${renameValue}"`);
      setIsRenameModalOpen(false);
      setFolderToRename(null);
      setRenameValue('');
      await fetchPhotos(); // Refresh photos to get new keys
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Could not rename collection. Please try again.', 'error');
    } finally {
      setIsRenaming(false);
    }
  };

  const togglePhotoSelection = (key: string) => {
    setSelectedPhotos(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const visiblePhotos = activeView === 'trash'
    ? trashPhotos
    : activeView === 'recent'
      ? [...photos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      : activeView === 'favorites'
        ? photos.filter(photo => photo.isFavorite)
        : photos;

  const currentFolderPhotos = visiblePhotos.filter(p => {
    const matchesFolder = activeView === 'recent' || activeView === 'trash' || activeView === 'favorites'
      ? true
      : activeFolder === 'all' || (activeFolder === 'favourites' ? p.isFavorite : p.key.startsWith(`${activeFolder}/`));
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || p.key.toLowerCase().includes(query);
    return matchesFolder && matchesSearch;
  });
  const recentPhotos = [...photos].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()).slice(0, 6);
  const collectionCards = realFolders.map(collection => {
    const collectionPhotos = photos.filter(photo => photo.key.startsWith(`${collection}/`));
    return {
      name: collection,
      count: collectionPhotos.length,
      cover: folderThumbnails[collection] || collectionPhotos[0]?.thumbUrl,
    };
  });
  const selectedCollectionName = activeView === 'trash'
    ? 'Trash'
    : activeView === 'recent'
      ? 'Recent'
      : activeView === 'favorites'
        ? 'Favorites'
        : activeView === 'collections'
          ? 'Collections'
          : formatCollectionName(activeFolder);
  const isCollectionsView = activeView === 'collections';
  const showDashboardSections = activeView === 'gallery' && activeFolder === 'all';
  const canGoBackToGallery = activeView !== 'gallery' || activeFolder !== 'all';
  const galleryContentKey = `${activeView}:${activeFolder}:${searchQuery.trim().toLowerCase()}:${currentFolderPhotos.map(photo => photo.key).join('|')}`;
  const coverPickerPhotos = coverPickerFolder
    ? photos.filter(photo => photo.key.startsWith(`${coverPickerFolder}/`))
    : [];
  const folderToDeletePhotoCount = folderToDelete
    ? photos.filter(photo => getPhotoCollection(photo) === folderToDelete).length
    : 0;

  const scrollMainContentToTop = () => {
    requestAnimationFrame(() => {
      mainContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  };

  const navigateSidebar = (view: GalleryView) => {
    setActiveView(view);
    setSelectedPhotos([]);
    if (view === 'favorites') setActiveFolder('favourites');
    if (view === 'gallery' || view === 'collections') setActiveFolder('all');
    if (view === 'trash') fetchTrashPhotos();
    scrollMainContentToTop();
  };

  const handleSelectAll = () => {
    const keys = currentFolderPhotos.map(p => p.key);
    setSelectedPhotos(keys);
  };

  const handleDeselectAll = () => {
    setSelectedPhotos([]);
  };

  const returnToGallery = () => {
    setActiveView('gallery');
    setActiveFolder('all');
    setSelectedPhotos([]);
    scrollMainContentToTop();
  };

  const openRenameCurrentFolder = () => {
    setIsActionsMenuOpen(false);
    if (isVirtualFolder(activeFolder)) {
      showToast('Select a real collection before renaming.', 'error');
      return;
    }
    setFolderToRename(activeFolder);
    setRenameValue(activeFolder);
    setIsRenameModalOpen(true);
  };

  const openDeleteCurrentFolder = () => {
    setIsActionsMenuOpen(false);
    handleDeleteFolder(activeFolder);
  };

  const openCollectionRename = (folder: string) => {
    setCollectionMenu(null);
    if (isVirtualFolder(folder)) {
      showToast('Select a real collection before renaming.', 'error');
      return;
    }
    setFolderToRename(folder);
    setRenameValue(folder);
    setIsRenameModalOpen(true);
  };

  const openCollectionDelete = (folder: string) => {
    setCollectionMenu(null);
    handleDeleteFolder(folder);
  };

  const openCollectionCoverPicker = (folder: string) => {
    setCollectionMenu(null);
    if (isVirtualFolder(folder)) {
      showToast('Select a real collection before setting its cover.', 'error');
      return;
    }
    setCoverPickerFolder(folder);
  };

  const openCollectionSelectionMode = (folder: string) => {
    setCollectionMenu(null);
    setActiveView(folder === 'favourites' ? 'favorites' : 'gallery');
    setActiveFolder(folder);
    const targetPhotos = folder === 'all'
      ? photos
      : folder === 'favourites'
        ? photos.filter(photo => photo.isFavorite)
        : photos.filter(photo => photo.key.startsWith(`${folder}/`));
    setSelectedPhotos(targetPhotos.map(photo => photo.key));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 selection:bg-blue-500/30">
      <Navbar user={user} onLogout={handleLogout} />

      <main className={cn(APP_SHELL_CLASS, "py-8 pb-32")}>
        {configStatus && !configStatus.isConfigured && (
          <div className="mb-8 rounded-xl bg-orange-500/10 p-4 border border-orange-500/20">
            <div className="flex items-center gap-3">
              <AlertCircle className="text-orange-500" size={24} />
              <div>
                <h3 className="font-bold text-orange-400">Storage Setup Needed</h3>
                <p className="text-sm text-zinc-400">
                  Reliora needs storage settings before uploads can be saved.
                </p>
              </div>
            </div>
          </div>
        )}

        {!user ? (
          <LandingOverlay onLoginSuccess={handleLoginSuccess} />
        ) : (
          <div className="-mx-6 -my-8 flex min-h-[calc(100vh-64px)] sm:-mx-8 lg:-mx-10">
            <Sidebar
              isDemoUser={!!isDemoUser}
              activeView={activeView}
              onNavigate={navigateSidebar}
              onLogin={() => {
                sessionStorage.setItem('cloudgallery-open-auth', 'true');
                handleLogout();
              }}
              onSignUp={() => {
                sessionStorage.setItem('cloudgallery-open-auth', 'true');
                handleLogout();
              }}
              isExpanded={sidebarExpanded}
              onExpandedChange={setSidebarExpanded}
            />
            <section
              ref={mainContentRef}
              className={cn(
                "min-w-0 flex-1 space-y-8 bg-[#0a0a0a] px-6 py-8 transition-[padding-left] duration-300 [overflow-anchor:none] sm:px-8 lg:px-10",
                sidebarExpanded ? "lg:pl-[296px]" : "lg:pl-[116px]"
              )}
            >
            {isAdminUser && (
              <div className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4",
                managingDemoGallery ? "border-blue-500/30 bg-blue-500/10" : "border-white/10 bg-white/[0.03]"
              )}>
                <div>
                  <p className="text-sm font-black text-white">
                    {managingDemoGallery ? 'Managing Demo Gallery' : 'Admin Mode'}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {managingDemoGallery ? 'Your changes affect the public demo gallery.' : 'Switch into demo management to edit demo content.'}
                  </p>
                </div>
                <button
                  onClick={() => setManagingDemoGallery(prev => !prev)}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-black text-black hover:bg-zinc-200"
                >
                  {managingDemoGallery ? 'Exit Demo Management' : 'Manage Demo Gallery'}
                </button>
              </div>
            )}
            {activeView === 'gallery' && (
            <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 shadow-2xl shadow-black/20">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                    Welcome back, {user.name || user.username}
                  </h1>
                  <p className="mt-2 text-zinc-400">
                    Organize, edit, revisit, and cherish every memory in one place.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-3 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition-all hover:brightness-110 active:scale-95"
                    >
                      <Plus size={18} />
                      Upload Photos
                    </button>
                    <button
                      onClick={() => setIsCreateFolderOpen(true)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/30 px-5 py-3 text-sm font-bold text-zinc-200 transition-all hover:bg-white/5"
                    >
                      <Box size={18} />
                      Create Collection
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:min-w-[660px]">
                  <StatCard label="Photos" value={photos.length} icon={<ImageIcon size={21} />} />
                  <StatCard label="Collections" value={realFolders.length} icon={<FolderIcon size={21} />} />
                  <StatCard label="Favorites" value={photos.filter(photo => photo.isFavorite).length} icon={<Heart size={21} />} />
                  <StatCard label="This Month" value={photosThisMonth(photos)} icon={<Calendar size={21} />} />
                </div>
              </div>
            </div>
            )}

            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between border-b border-white/5 pb-8">
              <div className="flex-1 min-w-0">
                {canGoBackToGallery && (
                  <button
                    onClick={returnToGallery}
                    className="mb-4 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-bold text-zinc-400 transition-all hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white"
                  >
                    <ChevronRight className="rotate-180" size={16} />
                    Back to Gallery
                  </button>
                )}
                <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{selectedCollectionName}</h2>
                <p className="mt-2 text-sm font-medium text-zinc-500">
                  {isCollectionsView
                    ? `${realFolders.length} ${realFolders.length === 1 ? 'collection' : 'collections'}`
                    : `${currentFolderPhotos.length} ${currentFolderPhotos.length === 1 ? 'photo' : 'photos'}`}
                </p>
                
                <AnimatePresence>
                  {selectedPhotos.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="mt-6 flex flex-wrap items-center gap-3"
                    >
                      <button
                        onClick={handleSelectAll}
                        className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-blue-500 transition-colors"
                      >
                        Select All
                      </button>
                      <span className="text-zinc-800">•</span>
                      <button
                        onClick={handleDeselectAll}
                        className="text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        Deselect All
                      </button>
                      <span className="text-zinc-800">•</span>
                      <span className="text-xs font-bold uppercase tracking-widest text-blue-500">
                        {selectedPhotos.length} {selectedPhotos.length === 1 ? 'photo' : 'photos'} selected
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap items-center gap-4 shrink-0">
                <AnimatePresence mode="wait">
                  {selectedPhotos.length > 0 ? (
                    <motion.div 
                      key="bulk-actions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="flex items-center gap-2"
                    >
                      <button
                        onClick={() => activeView === 'trash' ? handleBulkRestore() : isMutationBlocked ? showDemoRestrictionWarning() : setIsBulkMoveModalOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-blue-600/10 px-5 py-3 text-sm font-bold text-blue-500 border border-blue-500/20 transition-all hover:bg-blue-600 hover:text-white"
                      >
                        {activeView === 'trash' ? <RotateCcw size={18} /> : <FolderIcon size={18} />}
                        {activeView === 'trash' ? 'Restore' : 'Move'}
                      </button>
                      {activeView !== 'trash' && (
                        <button
                          onClick={handleBulkFavorite}
                          aria-label="Add selected photos to favorites"
                          className="flex items-center justify-center gap-2 rounded-xl bg-red-600/10 px-5 py-3 text-sm font-bold text-red-400 border border-red-500/20 transition-all hover:bg-red-600 hover:text-white"
                        >
                          <Heart size={18} />
                          Favorite
                        </button>
                      )}
                      <button
                        onClick={() => isMutationBlocked ? showDemoRestrictionWarning() : setIsBulkDeleteConfirmOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-xl bg-red-600/10 px-5 py-3 text-sm font-bold text-red-500 border border-red-500/20 transition-all hover:bg-red-600 hover:text-white"
                      >
                        <Trash2 size={18} />
                        {activeView === 'trash' ? 'Delete Forever' : 'Delete'}
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="stats"
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="hidden flex-col items-end sm:flex mr-4"
                    >
                      <span className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">Total Assets</span>
                      <span className="text-2xl font-black text-white">{photos.length}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-black shadow-xl shadow-white/10 transition-all hover:bg-zinc-200 active:scale-95"
                >
                  <Plus size={20} />
                  Upload Photos
                </button>
              </div>
            </div>

            {showDashboardSections && recentPhotos.length > 0 && (
              <section>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-black text-white">
                    <Clock size={18} />
                    Recently Added
                  </h3>
                  <button
                    onClick={() => {
                      setActiveView('recent');
                      setActiveFolder('all');
                      setSelectedPhotos([]);
                    }}
                    className="text-sm font-bold text-blue-400 hover:text-blue-300"
                  >
                    View all
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2">
                  {recentPhotos.map(photo => (
                    <button
                      key={`recent-${photo.key}`}
                      onClick={() => setViewingPhoto(photo)}
                      className="group relative h-32 w-56 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 text-left"
                    >
                      <img src={photo.thumbUrl} alt={photo.key} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                      <span className="absolute bottom-3 left-3 text-xs font-bold text-white">{formatRelativeTime(photo.lastModified)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(showDashboardSections || isCollectionsView) && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-base font-black text-white">
                  <FolderIcon size={18} />
                  Your Collections
                </h3>
                <button
                  onClick={() => {
                    setActiveView('collections');
                    setActiveFolder('all');
                    setSelectedPhotos([]);
                  }}
                  className="text-sm font-bold text-blue-400 hover:text-blue-300"
                >
                  View all
                </button>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-4">
                {collectionCards.map(collection => (
                  <div
                    key={`collection-${collection.name}`}
                    onClick={() => {
                      setActiveView(collection.name === 'favourites' ? 'favorites' : 'gallery');
                      setActiveFolder(collection.name);
                      setSelectedPhotos([]);
                    }}
                    className={cn(
                      "group overflow-hidden rounded-2xl border bg-white/[0.04] p-2 text-left transition-all hover:border-blue-500/40 hover:bg-white/[0.06]",
                      activeView === 'gallery' && activeFolder !== 'all' && activeFolder === collection.name ? "border-blue-500 shadow-lg shadow-blue-500/15" : "border-white/10"
                    )}
                  >
                    <div className="aspect-[1.45] overflow-hidden rounded-xl bg-zinc-900">
                      {collection.name === 'favourites' ? (
                        <div className="flex h-full w-full items-center justify-center bg-red-500/10 text-red-400">
                          <Heart size={30} fill="currentColor" />
                        </div>
                      ) : collection.cover ? (
                        <img src={collection.cover} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-600">
                          <FolderIcon size={28} />
                        </div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between px-1 pb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveView(collection.name === 'favourites' ? 'favorites' : 'gallery');
                          setActiveFolder(collection.name);
                          setSelectedPhotos([]);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-bold text-white">{formatCollectionName(collection.name)}</p>
                        <p className="text-sm text-zinc-500">{collection.count}</p>
                      </button>
                      <button
                        type="button"
                        aria-label={`${formatCollectionName(collection.name)} collection actions`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCollectionMenu({
                            x: e.clientX,
                            y: e.clientY,
                            folder: collection.name,
                          });
                        }}
                        className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setIsCreateFolderOpen(true)}
                  className="flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.03] text-zinc-400 transition-all hover:border-blue-500/40 hover:text-white"
                >
                  <Plus size={26} />
                  <span className="mt-2 text-sm font-bold">Create Collection</span>
                </button>
              </div>
            </section>
            )}

            {/* Collection Filter */}
            {!isCollectionsView && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500">
                    <FolderIcon size={20} />
                  </div>
                  {galleryFilterTabs.map((f) => (
                    <div key={f} className="group relative flex items-center">
                      <button
                        onClick={() => {
                          setActiveView(f === 'favourites' ? 'favorites' : 'gallery');
                          setActiveFolder(f);
                          setSelectedPhotos([]);
                        }}
                        onContextMenu={(e) => handleContextMenu(e, f)}
                        className={cn(
                          "flex items-center gap-2 whitespace-nowrap rounded-xl pl-1.5 pr-4 py-1.5 text-sm font-medium capitalize transition-all",
                          activeFolder === f 
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
                            : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                        )}
                      >
                        {f === 'favourites' ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/20 text-red-500">
                            <Heart size={14} fill="currentColor" />
                          </div>
                        ) : folderThumbnails[f] ? (
                          <img 
                            src={folderThumbnails[f]} 
                            alt="" 
                            className="h-8 w-8 rounded-lg object-cover border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
                            <FolderIcon size={14} className="opacity-40" />
                          </div>
                        )}
                        <span>{formatCollectionName(f)}</span>
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search photos..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 w-56 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsActionsMenuOpen(prev => !prev);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-zinc-900 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      aria-label="Gallery actions"
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    <AnimatePresence>
                      {isActionsMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute right-0 top-12 z-40 w-48 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
                        >
                          <button
                            onClick={() => {
                              setIsActionsMenuOpen(false);
                              setIsCreateFolderOpen(true);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <FolderIcon size={15} />
                            Create Collection
                          </button>
                          <button
                            onClick={openRenameCurrentFolder}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <Pencil size={15} />
                            Rename Collection
                          </button>
                          <button
                            onClick={openDeleteCurrentFolder}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 size={15} />
                            Delete Collection
                          </button>
                          <button
                            onClick={() => {
                              setIsActionsMenuOpen(false);
                              if (selectedPhotos.length !== 1) {
                                showToast('Select one photo to use as the collection cover.', 'error');
                                return;
                              }
                              handleSetCoverPhoto(selectedPhotos[0]);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <ImageIcon size={15} />
                            Set Cover Photo
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {!isDemoUser && photos.some(p => !p.key.includes('/')) && (
                <button
                  onClick={async () => {
                    const rootPhotos = photos.filter(p => !p.key.includes('/'));
                    setLoading(true);
                    try {
                      for (const p of rootPhotos) {
                        await handleMove(p.key, 'reezo');
                      }
                      showToast(`Moved ${rootPhotos.length} photos to Reezo`);
                    } catch (err) {
                      showToast('Some photos could not be moved. Please try again.', 'error');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-xs font-medium text-blue-500 hover:text-blue-400 underline underline-offset-4"
                >
                  Move uncategorized photos to Reezo
                </button>
              )}
            </div>
            )}

            {error && (
              <div className="flex items-center gap-3 rounded-xl bg-red-500/10 p-4 text-red-500 border border-red-500/20">
                <AlertCircle size={20} />
                <div className="flex-1">
                  <p className="font-semibold text-red-400">Could Not Load Gallery</p>
                  <p className="text-sm opacity-80">{error}</p>
                </div>
              </div>
            )}

            {!isCollectionsView && (
              <div className="min-h-[420px] rounded-3xl bg-[#0a0a0a] [overflow-anchor:none]">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="flex h-64 flex-col items-center justify-center gap-4"
                    >
                      <Loader2 className="animate-spin text-blue-500" size={40} />
                      <p className="text-zinc-500">Preparing your gallery...</p>
                    </motion.div>
                  ) : currentFolderPhotos.length > 0 ? (
                    <motion.div
                      key={galleryContentKey}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-6 2xl:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]"
                    >
                      {currentFolderPhotos.map((photo) => (
                        <motion.div
                          key={photo.key}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.18, ease: 'easeOut' }}
                          className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50"
                        >
                      <div 
                        role="button"
                        aria-label={selectedPhotos.includes(photo.key) ? `Deselect ${photo.key}` : `Select ${photo.key}`}
                        onClick={() => togglePhotoSelection(photo.key)}
                        className={cn(
                          "absolute left-4 top-4 z-10 h-6 w-6 rounded-lg border-2 transition-all flex items-center justify-center cursor-pointer",
                          selectedPhotos.includes(photo.key) 
                            ? "bg-blue-600 border-blue-600 text-white" 
                            : "bg-black/20 border-white/20 opacity-0 group-hover:opacity-100"
                        )}
                      >
                        {selectedPhotos.includes(photo.key) && <CheckCircle2 size={14} />}
                      </div>

                      {activeView !== 'trash' && (
                        <div className={cn(
                          "absolute right-4 top-4 z-10 transition-all duration-300",
                          photo.isFavorite ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}>
                          <button
                            aria-label={photo.isFavorite ? `Remove ${photo.key} from favorites` : `Add ${photo.key} to favorites`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(photo.key);
                            }}
                            className={cn(
                              "rounded-full p-2 backdrop-blur-md transition-all hover:scale-110",
                              photo.isFavorite 
                                ? "bg-white/20 text-white" 
                                : "bg-black/20 text-white hover:bg-white/20"
                            )}
                          >
                            <Heart size={16} fill={photo.isFavorite ? "white" : "none"} />
                          </button>
                        </div>
                      )}

                      <div className="absolute right-4 top-16 z-10 opacity-0 transition-all duration-300 group-hover:opacity-100">
                        <button
                          aria-label={`Preview ${photo.key}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingPhoto(photo);
                          }}
                          className="rounded-full bg-black/20 p-2 text-white backdrop-blur-md hover:bg-white/20"
                        >
                          <Maximize2 size={16} />
                        </button>
                      </div>
                      <img
                        src={photo.thumbUrl}
                        alt={photo.key}
                        referrerPolicy="no-referrer"
                        onClick={() => selectedPhotos.length > 0 ? togglePhotoSelection(photo.key) : setViewingPhoto(photo)}
                        className="h-full w-full cursor-pointer object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                      <div 
                        onClick={() => selectedPhotos.length > 0 ? togglePhotoSelection(photo.key) : setViewingPhoto(photo)}
                        className="absolute inset-0 cursor-pointer bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" 
                      />

                      <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-2 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-white">{photo.key.split('/').pop()}</p>
                            <p className="text-[10px] text-zinc-400">
                              {(photo.size / 1024).toFixed(1)} KB • {new Date(photo.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {activeView === 'trash' ? (
                              <>
                                <button
                                  aria-label={`Restore ${photo.key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestorePhoto(photo.key);
                                  }}
                                  className="rounded-lg bg-blue-500/20 p-2 text-blue-300 backdrop-blur-md transition-colors hover:bg-blue-500 hover:text-white"
                                >
                                  <RotateCcw size={16} />
                                </button>
                                <button
                                  aria-label={`Permanently delete ${photo.key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePermanentDeletePhoto(photo.key);
                                  }}
                                  className="rounded-lg bg-red-500/20 p-2 text-red-500 backdrop-blur-md transition-colors hover:bg-red-500 hover:text-white"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  aria-label={`Edit ${photo.key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPhoto(photo);
                                  }}
                                  className="rounded-lg bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-blue-500"
                                >
                                  <Pencil size={16} />
                                </button>
                                <a
                                  aria-label={`Download ${photo.key}`}
                                  href={photo.url}
                                  download
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded-lg bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                                >
                                  <Download size={16} />
                                </a>
                                {!isVirtualFolder(activeFolder) && activeView === 'gallery' && (
                                  <button
                                    aria-label={`Set ${photo.key} as collection cover`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSetCoverPhoto(photo.key);
                                    }}
                                    className="rounded-lg bg-white/10 p-2 text-white backdrop-blur-md transition-colors hover:bg-violet-500"
                                  >
                                    <ImageIcon size={16} />
                                  </button>
                                )}
                                <button
                                  aria-label={`Delete ${photo.key}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(photo.key);
                                  }}
                                  className="rounded-lg bg-red-500/20 p-2 text-red-500 backdrop-blur-md transition-colors hover:bg-red-500 hover:text-white"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                        </motion.div>
                      ))}
                    </motion.div>
                  ) : !error && (
                    <motion.div
                      key={`empty-${activeView}-${activeFolder}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      className="flex h-96 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-white/5 bg-zinc-900/20 p-12 text-center"
                    >
                      <div className={cn(
                        "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800",
                        activeFolder === 'favourites' ? "text-red-500" : "text-zinc-500"
                      )}>
                        {activeFolder === 'favourites' ? <Heart size={32} fill="currentColor" /> : <ImageIcon size={32} />}
                      </div>
                      <h3 className="text-xl font-semibold text-white">
                        {activeView === 'trash'
                          ? 'Trash is empty.'
                          : activeFolder === 'favourites'
                            ? 'No favorite photos yet'
                            : 'Your gallery is waiting for its first memory.'}
                      </h3>
                      {activeFolder !== 'favourites' && activeView !== 'trash' && (
                        <>
                          <p className="mt-2 text-zinc-500">Upload photos or create a collection to get started.</p>
                          <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <button
                              onClick={() => setIsUploadOpen(true)}
                              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                            >
                              Upload Photos
                            </button>
                            <button
                              onClick={() => setIsCreateFolderOpen(true)}
                              className="rounded-lg border border-white/10 bg-black/20 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
                            >
                              Create Collection
                            </button>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            </section>
          </div>
        )}
      </main>

      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        onUploadSuccess={() => { fetchPhotos(); showToast('Photo uploaded successfully'); }} 
        availableFolders={realFolders}
        photos={photos}
        isDemoUser={isMutationBlocked}
        onDemoRestriction={showDemoRestrictionWarning}
        onDemoUploadBlocked={showDemoUploadBlocked}
      />

      <ConfirmModal
        isOpen={!!confirmDelete}
        title="Delete Photo"
        message="Are you sure you want to delete this photo from your gallery? You can restore it from Trash."
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
        loading={isDeleting}
      />

      <ConfirmModal
        isOpen={isBulkDeleteConfirmOpen}
        title={activeView === 'trash' ? 'Permanently Delete Photos' : 'Delete Photos'}
        message={activeView === 'trash'
          ? `Are you sure you want to permanently delete ${selectedPhotos.length} selected ${selectedPhotos.length === 1 ? 'photo' : 'photos'} from your gallery? This action cannot be undone.`
          : `Are you sure you want to delete ${selectedPhotos.length} selected ${selectedPhotos.length === 1 ? 'photo' : 'photos'} from your gallery? You can restore them from Trash.`}
        onConfirm={activeView === 'trash' ? handleBulkPermanentDelete : handleBulkDelete}
        onClose={() => setIsBulkDeleteConfirmOpen(false)}
        loading={isDeleting}
      />

      <AnimatePresence>
        {isBulkMoveModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white">Move Photos</h3>
              <p className="mt-2 text-zinc-400">Select a target collection for {selectedPhotos.length} selected photos.</p>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">Target Collection</label>
                <div className="grid grid-cols-2 gap-2">
                  {realFolders.map(f => (
                    <button
                      key={f}
                      onClick={() => setBulkMoveTargetFolder(f)}
                      className={cn(
                        "rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-all",
                        bulkMoveTargetFolder === f 
                          ? "border-blue-500 bg-blue-500/10 text-blue-500" 
                          : "border-white/5 bg-black/20 text-zinc-400 hover:bg-black/40 hover:text-zinc-200"
                      )}
                    >
                      {formatCollectionName(f)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => {
                    setIsBulkMoveModalOpen(false);
                    setBulkMoveTargetFolder('');
                  }}
                  disabled={isBulkMoving}
                  className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkMove}
                  disabled={isBulkMoving || !bulkMoveTargetFolder}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  {isBulkMoving ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Move Photos'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCreateFolderOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white">Create Collection</h3>
              <p className="mt-2 text-zinc-400">Add a new collection to organize your memories.</p>

              <div className="mt-6">
                <label className="mb-2 block text-sm font-medium text-zinc-300">Collection Name</label>
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateFolder();
                    }
                  }}
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="New collection..."
                  autoFocus
                />
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateFolderOpen(false);
                    setNewFolderName('');
                  }}
                  disabled={isCreatingFolder}
                  className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFolder}
                  disabled={isCreatingFolder || !newFolderName.trim()}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  {isCreatingFolder ? <Loader2 className="mx-auto animate-spin" size={20} /> : 'Create'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {collectionMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: collectionMenu.y, left: collectionMenu.x }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[100] min-w-[210px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
          >
            <button
              onClick={() => openCollectionRename(collectionMenu.folder)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <Pencil size={14} />
              Rename Collection
            </button>
            <button
              onClick={() => openCollectionDelete(collectionMenu.folder)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 size={14} />
              Delete Collection
            </button>
            <button
              onClick={() => openCollectionCoverPicker(collectionMenu.folder)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <ImageIcon size={14} />
              Set Cover Photo
            </button>
            <button
              onClick={() => openCollectionSelectionMode(collectionMenu.folder)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <CheckCircle2 size={14} />
              Select Multiple
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-[100] min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl"
          >
            <button
              onClick={() => {
                setFolderToRename(contextMenu.folder);
                setRenameValue(contextMenu.folder);
                setIsRenameModalOpen(true);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 hover:text-white"
            >
              <Pencil size={14} />
              Rename Collection
            </button>
            <button
              onClick={() => {
                handleDeleteFolder(contextMenu.folder);
                setContextMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 size={14} />
              Delete Collection
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {coverPickerFolder && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white">Set Cover Photo</h3>
                  <p className="mt-2 text-sm text-zinc-400">
                    Choose a photo for {formatCollectionName(coverPickerFolder)}.
                  </p>
                </div>
                <button
                  onClick={() => setCoverPickerFolder(null)}
                  className="rounded-xl bg-white/10 p-2 text-zinc-300 hover:bg-white/15 hover:text-white"
                  aria-label="Close cover picker"
                >
                  <X size={18} />
                </button>
              </div>

              {coverPickerPhotos.length > 0 ? (
                <div className="mt-6 grid max-h-[55vh] grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3 overflow-y-auto pr-1">
                  {coverPickerPhotos.map(photo => (
                    <button
                      key={`cover-${photo.key}`}
                      onClick={() => handleSetCollectionCover(coverPickerFolder, photo.key)}
                      className="group overflow-hidden rounded-xl border border-white/10 bg-black/30 text-left transition-all hover:border-blue-500"
                    >
                      <div className="aspect-square overflow-hidden bg-zinc-950">
                        <img
                          src={photo.thumbUrl}
                          alt={photo.key}
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <p className="truncate px-3 py-2 text-xs font-medium text-zinc-300">
                        {photo.key.split('/').pop()}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-black/20 p-10 text-center">
                  <ImageIcon className="mx-auto text-zinc-600" size={36} />
                  <p className="mt-3 font-semibold text-white">No photos in this collection</p>
                  <p className="mt-1 text-sm text-zinc-500">Add photos before choosing a cover.</p>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Collection Confirmation Modal */}
      <AnimatePresence>
        {folderToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                <Trash2 size={24} />
              </div>
              <h3 className="mb-2 text-xl font-bold text-white">Delete Collection?</h3>
              {folderToDeletePhotoCount > 0 ? (
                <>
                  <p className="mb-6 text-zinc-400">
                    This collection contains <span className="font-bold text-white">{folderToDeletePhotoCount}</span> {folderToDeletePhotoCount === 1 ? 'photo' : 'photos'}. What would you like to do?
                  </p>
                  <div className="grid gap-3">
                    <button
                      onClick={() => setFolderToDelete(null)}
                      disabled={isDeletingFolder}
                      className="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteFolderConfirm('move')}
                      disabled={isDeletingFolder}
                      className="rounded-xl border border-blue-500/20 bg-blue-600/10 px-4 py-3 text-sm font-bold text-blue-300 transition-all hover:bg-blue-600 hover:text-white disabled:opacity-50"
                    >
                      {isDeletingFolder ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Move photos to All Photos and delete collection'}
                    </button>
                    <button
                      onClick={() => handleDeleteFolderConfirm('delete')}
                      disabled={isDeletingFolder}
                      className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeletingFolder ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Delete collection and its photos'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-6 text-zinc-400">
                    Are you sure you want to delete the collection <span className="font-bold text-white">"{formatCollectionName(folderToDelete)}"</span>?
                    This will remove the empty collection from your gallery.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFolderToDelete(null)}
                      disabled={isDeletingFolder}
                      className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-bold text-white transition-all hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDeleteFolderConfirm('empty')}
                      disabled={isDeletingFolder}
                      className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white transition-all hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeletingFolder ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Delete Collection'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isRenameModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-white">Rename Collection</h3>
              <p className="mt-2 text-zinc-400">Enter a new name for the collection "{folderToRename ? formatCollectionName(folderToRename) : ''}".</p>
              
              <div className="mt-6">
                <label className="block text-sm font-medium text-zinc-300 mb-2">New Collection Name</label>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-black/50 px-4 py-3 text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="New name..."
                  autoFocus
                />
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => {
                    setIsRenameModalOpen(false);
                    setFolderToRename(null);
                    setRenameValue('');
                  }}
                  disabled={isRenaming}
                  className="flex-1 rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameFolder}
                  disabled={isRenaming || !renameValue.trim() || renameValue === folderToRename}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
                >
                  {isRenaming ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'Rename'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PhotoViewModal
        photo={viewingPhoto}
        onClose={() => setViewingPhoto(null)}
        onEdit={(photo) => {
          setViewingPhoto(null);
          setEditingPhoto(photo);
        }}
        onFavorite={(photo) => toggleFavorite(photo.key)}
        onDelete={(photo) => {
          setViewingPhoto(null);
          setConfirmDelete(photo.key);
        }}
      />

      <PhotoEditorModal
        photo={editingPhoto}
        isDemoUser={isMutationBlocked}
        onClose={() => setEditingPhoto(null)}
        onSaved={() => {
          fetchPhotos();
          showToast('Edited copy saved');
        }}
        onDemoSave={() => showToast('Create your own gallery to save edited photos.', 'error')}
      />

      <AnimatePresence>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 py-8">
        <div className={cn(APP_SHELL_CLASS, "text-center text-zinc-500")}>
          <p className="text-sm">{BRAND_NAME} • {BRAND_TAGLINE}</p>
        </div>
      </footer>
    </div>
  );
}
