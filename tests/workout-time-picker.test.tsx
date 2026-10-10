import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import WorkoutTimePicker from '../src/components/workout/WorkoutTimePicker';
import { toLocalWorkoutTime } from '../src/utils/workoutTime';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).HTMLElement = class {};
(globalThis as any).document = { body: { style: { overflow: '' } }, activeElement: null };
(globalThis as any).window = { innerHeight: 844 };
const changes: Array<string | null> = [];
let tree!: ReactTestRenderer;
const button = (label: string) => tree.root.findAllByType('button').find(node => node.props['aria-label'] === label || node.children.join('') === label)!;
try {
  await act(async () => { tree = create(<WorkoutTimePicker value="2025-06-11T19:00" onChange={value => changes.push(value)} />, {
    createNodeMock: element => element.type === 'dialog' ? { showModal() {}, close() {}, style: { setProperty() {} } } : null,
  }); });
  assert.equal(tree.root.findAllByType('input').length, 0, 'Do not invoke Android native date/time controls');
  await act(async () => { tree.root.findByProps({ id: 'workout-time' }).props.onClick(); });
  await act(async () => { button('2025-06-10').props.onClick(); });
  const hours = tree.root.findByProps({ 'aria-label': '选择小时' });
  const minutes = tree.root.findByProps({ 'aria-label': '选择分钟' });
  await act(async () => { hours.findAllByType('button')[7].props.onClick(); });
  await act(async () => { minutes.findAllByType('button')[35].props.onClick(); });
  assert.equal(changes.length, 0, 'Selection is staged until confirmation');
  const confirm = () => tree.root.findAllByType('button').find(node => node.children.includes('确认时间'))!;
  await act(async () => { confirm().props.onClick(); });
  assert.equal(changes[0], '2025-06-10T07:35');
  assert.equal(tree.root.findAllByType('dialog').length, 0);
  await act(async () => { tree.root.findByProps({ id: 'workout-time' }).props.onClick(); });
  await act(async () => { button('昨天').props.onClick(); });
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  await act(async () => { confirm().props.onClick(); });
  assert.equal(changes[1], `${toLocalWorkoutTime(yesterday).slice(0, 10)}T19:00`);
  await act(async () => { tree.root.findByProps({ id: 'workout-time' }).props.onClick(); });
  await act(async () => { button('使用当前时间').props.onClick(); });
  assert.equal(changes[2], null, 'Automatic submission time is explicitly restored');
  assert.equal(document.body.style.overflow, '', 'Dialog restores body scrolling');
  console.log('PASS custom workout time picker: no native inputs, staged calendar/time selection, quick yesterday, automatic time, dialog cleanup');
} finally { await act(async () => tree?.unmount()); }
