import assert from 'node:assert/strict';
import React from 'react';
import {create,act, type ReactTestRenderer} from 'react-test-renderer';
import WorkoutPhoto from '../src/components/WorkoutPhoto';
import {supabase} from '../src/lib/supabase';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let auth:(event:string)=>void=()=>{};let fail=true, downloads=0, sequence=0;
const revoked:string[]=[];
const original={from:supabase.storage.from,auth:supabase.auth.onAuthStateChange,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
URL.createObjectURL=()=>`blob:photo-${++sequence}`;URL.revokeObjectURL=url=>{revoked.push(url);};
(supabase.auth as any).onAuthStateChange=(callback:any)=>{auth=callback;return{data:{subscription:{unsubscribe:()=>{}}}};};
(supabase.storage as any).from=()=>({getPublicUrl:(path:string)=>({data:{publicUrl:`https://photos.test/storage/v1/object/public/workouts/${path}`}}),download:async()=>{downloads++;return{data:fail?null:new Blob(['private photo']),error:fail?new Error('offline'):null};}});
let renderer:ReactTestRenderer;
const settle=async()=>{for(let i=0;i<5;i++)await act(async()=>{await new Promise(r=>setTimeout(r,0));});};
try{
 await act(async()=>{renderer=create(<WorkoutPhoto reference="https://photos.test/storage/v1/object/public/workouts/owner/a.jpg" alt="test"/>);});await settle();
 assert.equal(renderer!.root.findAllByType('img').length,0);
 fail=false;await act(async()=>{renderer!.root.findByType('button').props.onClick();});await settle();
 const source=renderer!.root.findByType('img').props.src;assert.match(source,/^blob:/);assert.ok(downloads>=2);
 fail=true;await act(async()=>{auth('SIGNED_IN');});await settle();
 assert.equal(renderer!.root.findAllByType('img').length,0,'Changed session cannot display previous private blob');assert.ok(revoked.includes(source));
 fail=false;await act(async()=>{renderer!.root.findByType('button').props.onClick();});await settle();
 const latest=renderer!.root.findByType('img').props.src;
 await act(async()=>{renderer!.unmount();});assert.ok(revoked.includes(latest));
 console.log('PASS photo UI lifecycle: offline retry, authenticated blob rendering, account-change revocation and unmount cleanup');
}finally{(supabase.storage as any).from=original.from;supabase.auth.onAuthStateChange=original.auth;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;}
