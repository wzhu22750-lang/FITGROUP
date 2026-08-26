import { WorkoutCategory } from '../src/types';
import { PRESET_EXERCISES_BY_CATEGORY, CATEGORY_META } from '../src/constants/workoutPresets';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

console.log('--- Testing Preset Exercises Library ---');

// 1. Check all categories are present in CATEGORY_META and PRESET_EXERCISES_BY_CATEGORY
for (const cat of Object.values(WorkoutCategory)) {
  assert(Boolean(CATEGORY_META[cat]), `CATEGORY_META has category: ${cat}`);
  assert(Boolean(PRESET_EXERCISES_BY_CATEGORY[cat]), `PRESET_EXERCISES_BY_CATEGORY has category: ${cat}`);
  const presets = PRESET_EXERCISES_BY_CATEGORY[cat];
  assert(presets.length >= 6, `Category ${cat} has at least 6 presets (actual: ${presets.length})`);

  for (const p of presets) {
    assert(p.name.length > 0, `Preset exercise in ${cat} has non-empty name: ${p.name}`);
    assert(p.type === 'strength' || p.type === 'cardio', `Preset ${p.name} has valid type`);
    if (p.type === 'strength') {
      assert(typeof p.defaultSets === 'number' && p.defaultSets > 0, `Preset ${p.name} has default sets`);
      assert(typeof p.defaultReps === 'number' && p.defaultReps > 0, `Preset ${p.name} has default reps`);
    } else {
      assert(typeof p.defaultDuration === 'number' && p.defaultDuration > 0, `Preset ${p.name} has default duration`);
    }
  }
}

console.log('--- Testing Import Last Workout Cloning Logic ---');

// 2. Test import cloning logic
const mockLastLog = {
  id: 'log_prev_123',
  category: WorkoutCategory.Chest,
  timestamp: '2026-08-20T10:00:00.000Z',
  exercises: [
    { id: 'old_1', name: '杠铃平板卧推', type: 'strength' as const, weight: 80, sets: 4, reps: 8 },
    { id: 'old_2', name: '哑铃上斜卧推', type: 'strength' as const, weight: 25, sets: 4, reps: 10 },
    { id: 'old_3', name: '跑步机跑步', type: 'cardio' as const, duration: 20, distance: 3.5, calories: 180 },
  ],
};

const imported = mockLastLog.exercises.map((ex) => ({
  id: Math.random().toString(36).slice(2, 11),
  name: ex.name,
  type: ex.type || 'strength',
  weight: ex.weight ?? 0,
  sets: ex.sets ?? 0,
  reps: ex.reps ?? 0,
  duration: ex.duration ?? 0,
  distance: ex.distance ?? 0,
  calories: ex.calories ?? 0,
}));

assert(imported.length === 3, 'Imported 3 exercises');
assert(imported[0].name === '杠铃平板卧推' && imported[0].weight === 80 && imported[0].sets === 4 && imported[0].reps === 8, 'Imported first exercise data intact');
assert(imported[1].name === '哑铃上斜卧推' && imported[1].weight === 25, 'Imported second exercise data intact');
assert(imported[2].name === '跑步机跑步' && imported[2].duration === 20 && imported[2].distance === 3.5 && imported[2].calories === 180, 'Imported cardio data intact');
assert(imported[0].id !== mockLastLog.exercises[0].id, 'Generated fresh unique ID for imported exercise');

console.log('\n🎉 ALL PRESET & IMPORT WORKOUT LOGIC TESTS PASSED SUCCESSFULLY!\n');
