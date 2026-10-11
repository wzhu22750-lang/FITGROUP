import assert from 'node:assert/strict';
import { compressImage, uploadWorkoutPhoto, uploadUserAvatar } from '../src/utils/imageUpload';

console.log('--- Testing Image Upload & Compression Contracts ---');

// 1. Oversized file (>15MB) rejected
{
  const fakeBigBlob = new Blob([new Uint8Array(16 * 1024 * 1024)], { type: 'image/jpeg' });
  let rejected = false;
  try {
    await compressImage(fakeBigBlob);
  } catch (err: any) {
    rejected = true;
    assert.match(err.message, /15MB/, 'Error message specifies 15MB limit');
  }
  assert.equal(rejected, true, 'Oversized image must be rejected');
  console.log('✅ PASSED: Files > 15MB rejected before upload');
}

// 2. Unsupported MIME types rejected
{
  const fakePdfBlob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  let rejected = false;
  try {
    await compressImage(fakePdfBlob);
  } catch (err: any) {
    rejected = true;
    assert.match(err.message, /支持 JPG、PNG 或 WebP/, 'Error message specifies supported formats');
  }
  assert.equal(rejected, true, 'Non-image MIME type must be rejected');
  console.log('✅ PASSED: Non-image MIME types rejected');
}

// 3. Supported MIME types accepted
{
  const validJpeg = new Blob(['fake-jpg-data'], { type: 'image/jpeg' });
  const result = await compressImage(validJpeg);
  assert.ok(result, 'Valid JPEG is accepted');
  console.log('✅ PASSED: Valid JPEG image accepted');
}

// 4. Unauthenticated uploads rejected
{
  const validJpeg = new Blob(['fake-jpg-data'], { type: 'image/jpeg' });
  let rejectedWorkout = false;
  try {
    await uploadWorkoutPhoto(validJpeg, '');
  } catch (err: any) {
    rejectedWorkout = true;
    assert.match(err.message, /未登录/, 'Unauthenticated workout upload rejected');
  }
  assert.equal(rejectedWorkout, true, 'Workout photo requires authenticated userId');

  let rejectedAvatar = false;
  try {
    await uploadUserAvatar(validJpeg, '');
  } catch (err: any) {
    rejectedAvatar = true;
    assert.match(err.message, /未登录/, 'Unauthenticated avatar upload rejected');
  }
  assert.equal(rejectedAvatar, true, 'Avatar photo requires authenticated userId');
  console.log('✅ PASSED: Unauthenticated photo uploads fail closed');
}

console.log('🎉 ALL IMAGE UPLOAD & COMPRESSION TESTS PASSED SUCCESSFULLY!\n');
