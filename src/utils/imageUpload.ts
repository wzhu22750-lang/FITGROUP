/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../lib/supabase';

export interface ImageCompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/webp';
}

const DEFAULT_WORKOUT_OPTIONS: ImageCompressionOptions = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.82,
  mimeType: 'image/jpeg',
};

const DEFAULT_AVATAR_OPTIONS: ImageCompressionOptions = {
  maxWidth: 400,
  maxHeight: 400,
  quality: 0.85,
  mimeType: 'image/jpeg',
};

const MAX_INPUT_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

/**
 * Compress an image file using HTMLCanvasElement.
 * Scales down large camera photos to reduce upload bandwidth and mobile memory consumption.
 */
export async function compressImage(
  file: File | Blob,
  options: ImageCompressionOptions = DEFAULT_WORKOUT_OPTIONS,
): Promise<Blob> {
  if (file.size > MAX_INPUT_FILE_BYTES) {
    throw new Error('图片体积过大（超过 15MB），请选择较小的照片');
  }

  const mime = file.type || 'image/jpeg';
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('仅支持 JPG、PNG 或 WebP 格式的图片');
  }

  // Node environment or test environment fallback
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof Image === 'undefined') {
    return file;
  }

  const maxWidth = options.maxWidth ?? 1200;
  const maxHeight = options.maxHeight ?? 1200;
  const quality = options.quality ?? 0.82;
  const outputMime = options.mimeType ?? 'image/jpeg';

  return new Promise<Blob>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      // Draw with white background for transparency fallback
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        outputMime,
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('图片解析失败，可能格式损坏'));
    };

    img.src = objectUrl;
  });
}

/**
 * Upload a compressed training photo to Supabase Storage 'workouts' bucket.
 * Returns the public URL of the uploaded image.
 */
export async function uploadWorkoutPhoto(
  file: File | Blob,
  userId: string,
  logId?: string,
): Promise<string> {
  if (!userId) throw new Error('未登录用户无法上传训练照片');

  const compressedBlob = await compressImage(file, DEFAULT_WORKOUT_OPTIONS);
  const fileExt = compressedBlob.type === 'image/webp' ? 'webp' : 'jpg';
  const prefix = logId ? logId.replace(/[^a-zA-Z0-9_-]/g, '') : 'log';
  const fileName = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('workouts')
    .upload(filePath, compressedBlob, {
      contentType: compressedBlob.type,
      upsert: true,
    });

  if (error) {
    console.error('Workout photo upload failed:', error);
    throw new Error(`照片上传失败: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('workouts')
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}

/**
 * Upload a compressed user avatar to Supabase Storage 'avatars' bucket.
 * Returns the public URL of the uploaded avatar.
 */
export async function uploadUserAvatar(
  file: File | Blob,
  userId: string,
): Promise<string> {
  if (!userId) throw new Error('未登录用户无法更新头像');

  const compressedBlob = await compressImage(file, DEFAULT_AVATAR_OPTIONS);
  const fileExt = compressedBlob.type === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `avatar_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(filePath, compressedBlob, {
      contentType: compressedBlob.type,
      upsert: true,
    });

  if (error) {
    console.error('Avatar upload failed:', error);
    throw new Error(`头像上传失败: ${error.message}`);
  }

  const { data: publicUrlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}
