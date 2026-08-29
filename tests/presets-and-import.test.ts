import { WorkoutCategory } from '../src/types';
import {
  PRESET_EXERCISES_BY_CATEGORY,
  CATEGORY_META,
  parseCategories,
  formatCategoriesZh,
  formatCategoriesEn,
  getCategoryBadgeColor,
  getCardioMET,
  estimateCardioCalories,
  isCardioDistanceOptional,
  inferLogCategories,
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

console.log('--- Testing Cardio MET & Automatic Calorie Calculation ---');

// 4. Test Cardio MET and Calorie Calculations
{
  // MET lookup
  assert(getCardioMET('羽毛球') === 6.5, 'MET for 羽毛球 is 6.5');
  assert(getCardioMET('打羽毛球') === 6.5, 'MET for 打羽毛球 alias is 6.5');
  assert(getCardioMET('篮球') === 7.0, 'MET for 篮球 is 7.0');
  assert(getCardioMET('游泳') === 7.0, 'MET for 游泳 is 7.0');
  assert(getCardioMET('跳绳') === 9.0, 'MET for 跳绳 is 9.0');
  assert(getCardioMET('户外跑步') === 9.0, 'MET for 户外跑步 is 9.0');
  assert(getCardioMET('乒乓球') === 4.0, 'MET for 乒乓球 is 4.0');

  // Calorie calculations (MET * Weight * (Duration / 60))
  // Badminton: 6.5 * 65 * (45 / 60) = 316.875 -> 317 kcal
  const calBadminton65 = estimateCardioCalories('羽毛球', 45, 65);
  assert(calBadminton65 === 317, `Badminton 45min at 65kg = 317 kcal (actual: ${calBadminton65})`);

  // Badminton 70kg 60min: 6.5 * 70 * 1 = 455 kcal
  const calBadminton70 = estimateCardioCalories('羽毛球', 60, 70);
  assert(calBadminton70 === 455, `Badminton 60min at 70kg = 455 kcal (actual: ${calBadminton70})`);

  // Running 30min at 70kg: 9.0 * 70 * 0.5 = 315 kcal
  const calRun70 = estimateCardioCalories('户外跑步', 30, 70);
  assert(calRun70 === 315, `Running 30min at 70kg = 315 kcal (actual: ${calRun70})`);

  // Zero duration returns 0
  assert(estimateCardioCalories('羽毛球', 0, 70) === 0, 'Zero duration returns 0 kcal');

  // Distance optional check
  assert(isCardioDistanceOptional('羽毛球') === true, 'Distance is optional for 羽毛球');
  assert(isCardioDistanceOptional('篮球') === true, 'Distance is optional for 篮球');
  assert(isCardioDistanceOptional('跳绳') === true, 'Distance is optional for 跳绳');
  assert(isCardioDistanceOptional('拳击') === true, 'Distance is optional for 拳击');
  assert(isCardioDistanceOptional('户外跑步') === false, 'Distance is relevant for 户外跑步');
  assert(isCardioDistanceOptional('动感单车') === false, 'Distance is relevant for 动感单车');
}

console.log('--- Testing Compound Movement & Auto Category Inference ---');

// 5. Test inferLogCategories for Compound Movements
{
  // Test Deadlift (硬拉) - originally only tagged Back -> infers Back + Legs
  const deadliftCategories = inferLogCategories('Back', undefined, [{ name: '传统硬拉', type: 'strength' }]);
  assert(deadliftCategories.includes(WorkoutCategory.Back), 'Deadlift includes Back');
  assert(deadliftCategories.includes(WorkoutCategory.Legs), 'Deadlift includes Legs');
  assert(deadliftCategories.length === 2, 'Deadlift infers exactly 2 categories (Back + Legs)');

  // Test Incline Bench (上斜卧推) - originally only tagged Chest -> infers Chest + Shoulders
  const inclineCategories = inferLogCategories('Chest', undefined, [{ name: '哑铃上斜卧推', type: 'strength' }]);
  assert(inclineCategories.includes(WorkoutCategory.Chest), 'Incline bench includes Chest');
  assert(inclineCategories.includes(WorkoutCategory.Shoulders), 'Incline bench includes Shoulders');

  // Test Multi-exercise log - Bench Press + Seated Row (Chest + Back)
  const multiExCategories = inferLogCategories('Chest', undefined, [
    { name: '杠铃平板卧推', type: 'strength' },
    { name: '高位下拉', type: 'strength' },
  ]);
  assert(multiExCategories.includes(WorkoutCategory.Chest), 'Multi includes Chest');
  assert(multiExCategories.includes(WorkoutCategory.Back), 'Multi includes Back');

  // Test Cardio + Strength mix
  const mixCategories = inferLogCategories('Cardio', undefined, [
    { name: '羽毛球', type: 'cardio' },
    { name: '引体向上', type: 'strength' },
  ]);
  assert(mixCategories.includes(WorkoutCategory.Cardio), 'Mix includes Cardio');
  assert(mixCategories.includes(WorkoutCategory.Back), 'Mix includes Back');
}

console.log('\n🎉 ALL PRESET & MULTI-CATEGORY WORKOUT TESTS PASSED SUCCESSFULLY!\n');
