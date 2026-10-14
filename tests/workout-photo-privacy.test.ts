import assert from 'node:assert/strict';
import { supabase } from '../src/lib/supabase';
import { workoutPhotoPath, downloadWorkoutPhoto, trackUploadedPhoto, cleanupWorkoutPhotos } from '../src/utils/workoutPhotos';
import { uploadWorkoutPhoto } from '../src/utils/imageUpload';
const storage = new Map<string,string>();
(globalThis as any).localStorage={getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)};
let uid='owner'; const removed:string[]=[]; let uploads=0, deny=false;
const originalStorage=supabase.storage.from, originalSession=supabase.auth.getSession;
(supabase.auth as any).getSession=async()=>({data:{session:{user:{id:uid}}}});
(supabase.storage as any).from=()=>({getPublicUrl:(path:string)=>({data:{publicUrl:`https://photos.test/storage/v1/object/public/workouts/${path}`}}),
  upload:async(path:string,_blob:Blob,options:any)=>{assert.equal(options.upsert,false);uploads++;return{data:{path},error:null};},
  download:async(path:string)=>({data:new Blob(['photo']),error:deny?new Error('403 forbidden'):null}),
  remove:async(paths:string[])=>{removed.push(...paths);return{data:paths.map(name=>({name})),error:null};},
});
try {
  const ref='https://photos.test/storage/v1/object/public/workouts/owner/file.jpg';
  assert.equal(workoutPhotoPath(ref),'owner/file.jpg');
  for(const bad of ['https://evil.test/storage/v1/object/public/workouts/owner/file.jpg', 'javascript:alert(1)', 'https://photos.test/storage/v1/object/public/workouts/owner/%2e%2e/file.jpg']) assert.equal(workoutPhotoPath(bad),null);
  assert.equal((await downloadWorkoutPhoto(ref)).size,5);
  deny=true; await assert.rejects(()=>downloadWorkoutPhoto(ref),/403/); deny=false;
  const controller=new AbortController();controller.abort(new Error('cancelled'));await assert.rejects(()=>downloadWorkoutPhoto(ref,controller.signal),/cancelled/);
  await uploadWorkoutPhoto(new Blob(['x'],{type:'image/jpeg'}),'owner','draft');assert.equal(uploads,1);
  trackUploadedPhoto('owner',ref,true); await cleanupWorkoutPhotos('owner',[ref]); assert.equal(removed.length,0,'Restored draft is protected');
  uid='other';await cleanupWorkoutPhotos('owner');assert.equal(removed.length,0,'A different account cannot drain owner queue');
  uid='owner';await cleanupWorkoutPhotos('owner');assert.deepEqual(removed,['owner/file.jpg']);
  trackUploadedPhoto('owner','https://photos.test/storage/v1/object/public/workouts/other/private.jpg',true);await cleanupWorkoutPhotos('owner');assert.equal(removed.length,1,'Cross-owner object cannot enter cleanup queue');
  // Model the observed fixed-URL cache: no-store alone can return an old Blob
  // after the backing object or its access has been removed.
  const uncachedFrom = supabase.storage.from; let allowed = true; let cachedBlob: Blob | null = null;
  const nonces: Array<string | undefined> = [];
  (supabase.storage as any).from = (bucket: string) => ({ ...uncachedFrom.call(supabase.storage, bucket), download: async (_path: string, options: { cacheNonce?: string }, parameters: RequestInit) => {
    assert.equal(parameters.cache, 'no-store'); nonces.push(options.cacheNonce);
    if (!options.cacheNonce && cachedBlob) return { data: cachedBlob, error: null };
    if (!allowed) return { data: null, error: new Error('403 revoked') };
    cachedBlob = new Blob(['private']); return { data: cachedBlob, error: null };
  } });
  await downloadWorkoutPhoto(ref); allowed = false;
  await assert.rejects(() => downloadWorkoutPhoto(ref), /revoked/, 'Fresh authorization cannot be bypassed by an old fixed-URL response');
  assert.ok(nonces.every(nonce => typeof nonce === 'string' && nonce.length > 0));
  assert.notEqual(nonces[0], nonces[1], 'Each explicit download has its own cache nonce');
  console.log('PASS photo privacy: authenticated downloads, access denial, cancellation, immutable upload, delayed orphan queue, draft preservation and user isolation');
} finally { (supabase.storage as any).from=originalStorage;supabase.auth.getSession=originalSession; }
