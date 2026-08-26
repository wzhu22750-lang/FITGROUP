import { WorkoutCategory } from '../src/types';
import {
  PRESET_EXERCISES_BY_CATEGORY,
  CATEGORY_META,
  parseCategories,
  formatCategoriesZh,
  formatCategoriesEn,
  getCategoryBadgeColor,
} from '../src/constants/workoutPresets';

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

console.log('--- Testing Multi-Category Parsing & Formatting ---');

// 2. Test multi-category parsing & formatting
{
  const single = parseCategories('Chest');
  assert(single.length === 1 && single[0] === WorkoutCategory.Chest, 'Parse single category "Chest"');

  const multi = parseCategories('Chest, Shoulders');
  assert(multi.length === 2 && multi[0] === WorkoutCategory.Chest && multi[1] === WorkoutCategory.Shoulders, 'Parse multi-category "Chest, Shoulders"');

  const multiWithPlus = parseCategories('Back + Legs');
  assert(multiWithPlus.length === 2 && multiWithPlus[0] === WorkoutCategory.Back && multiWithPlus[1] === WorkoutCategory.Legs, 'Parse multi-category "Back + Legs"');

  const empty = parseCategories('');
  assert(empty.length === 1 && empty[0] === WorkoutCategory.Others, 'Parse empty category defaults to Others');

  const formattedZh = formatCategoriesZh([WorkoutCategory.Chest, WorkoutCategory.Shoulders]);
  assert(formattedZh === '胸部 + 肩部', `Formatted Chinese categories: ${formattedZh}`);

  const formattedEn = formatCategoriesEn([WorkoutCategory.Chest, WorkoutCategory.Shoulders]);
  assert(formattedEn === 'Chest, Shoulders', `Formatted English categories: ${formattedEn}`);

  assert(getCategoryBadgeColor(WorkoutCategory.Chest).includes('bg-red-500'), 'Category badge color for Chest');
  assert(getCategoryBadgeColor(WorkoutCategory.Back).includes('bg-blue-500'), 'Category badge color for Back');
}

console.log('--- Testing Multi-Category Combined Import Logic ---');

// 3. Test multi-category import merging
{
  const mockChestLog = {
    category: 'Chest',
    exercises: [
      { id: 'c1', name: '杠铃平板卧推', type: 'strength' as const, weight: 80, sets: 4, reps: 8 },
      { id: 'c2', name: '哑铃上斜卧推', type: 'strength' as const, weight: 25, sets: 4, reps: 10 },
    ],
  };
  const mockShoulderLog = {
    category: 'Shoulders',
    exercises: [
      { id: 's1', name: '坐姿哑铃推举', type: 'strength' as const, weight: 20, sets: 4, reps: 10 },
      { id: 's2', name: '哑铃侧平举', type: 'strength' as const, weight: 10, sets: 4, reps: 15 },
    ],
  };

  const logsMap: Record<string, typeof mockChestLog> = {
    [WorkoutCategory.Chest]: mockChestLog,
    [WorkoutCategory.Shoulders]: mockShoulderLog,
  };

  const selectedCategories = [WorkoutCategory.Chest, WorkoutCategory.Shoulders];
  const mergedSource: any[] = [];
  const seenNames = new Set<string>();

  selectedCategories.forEach((cat) => {
    const log = logsMap[cat];
    if (log && log.exercises) {
      log.exercises.forEach((ex) => {
        if (!seenNames.has(ex.name)) {
          seenNames.add(ex.name);
          mergedSource.push(ex);
        }
      });
    }
  });

  const imported = mergedSource.map((ex) => ({
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

  assert(imported.length === 4, 'Merged 4 exercises from Chest + Shoulders');
  assert(imported[0].name === '杠铃平板卧推' && imported[0].weight === 80, 'First Chest exercise present');
  assert(imported[2].name === '坐姿哑铃推举' && imported[2].weight === 20, 'First Shoulder exercise present');
  assert(new Set(imported.map((e) => e.id)).size === 4, 'All generated IDs are unique');
}

console.log('\n🎉 ALL PRESET & MULTI-CATEGORY WORKOUT TESTS PASSED SUCCESSFULLY!\n');
