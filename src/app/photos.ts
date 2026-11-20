// Dish photos. Your own photos (taken in the app) are saved on the phone,
// separately from the rest of the data so every small change stays fast.
// A recipe may also come with a free photo (recipe.photo, with a credit).
// Your own photo wins over the recipe's.

import { useEffect, useState } from 'preact/hooks';
import { RECIPE_BY_ID } from './catalog';
import { dbGet, dbSet } from './db';

const KEY = 'photos';
let photos: Record<string, string> = {};
const listeners = new Set<() => void>();

function changed(): void {
  listeners.forEach((l) => l());
  void dbSet(KEY, photos);
}

export async function loadPhotos(): Promise<void> {
  photos = (await dbGet<Record<string, string>>(KEY)) ?? {};
  listeners.forEach((l) => l());
}

export function getPhotos(): Record<string, string> {
  return photos;
}

export function setAllPhotos(next: Record<string, string>): void {
  photos = { ...next };
  changed();
}

export function setPhoto(recipeId: string, dataUrl: string): void {
  photos = { ...photos, [recipeId]: dataUrl };
  changed();
}

export function removePhoto(recipeId: string): void {
  const next = { ...photos };
  delete next[recipeId];
  photos = next;
  changed();
}

export interface DishPhoto {
  src: string;
  mine: boolean;
  credit?: string;
}

/** The photo to show for a recipe, or null for the sunset picture. */
export function photoFor(recipeId: string): DishPhoto | null {
  if (photos[recipeId]) return { src: photos[recipeId], mine: true };
  const r = RECIPE_BY_ID.get(recipeId) as { photo?: string | null; photoCredit?: string } | undefined;
  if (!r?.photo) return null;
  const src = /^https?:/.test(r.photo) ? r.photo : `${import.meta.env.BASE_URL}${r.photo.replace(/^\//, '')}`;
  return { src, mine: false, credit: r.photoCredit };
}

export function usePhotos(): void {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** Shrink a photo from the camera to at most 1000 px, as a JPEG data URL. */
export async function shrinkPhoto(file: File, max = 1000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('This photo could not be opened.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
