import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildTeamRuntime,
    getActiveBoardBlocks,
    getBoardRevealProgress,
} from '../../src/renderer/lib/handwriteAdapter';
import exampleTask from '../../src/renderer/mock/teamTask.example.json';
import type { TeamTaskDefinition } from '../../src/renderer/types/teamRuntime';

const teamTaskDefinition = exampleTask as TeamTaskDefinition;

test('buildTeamRuntime wires the 418-170-118 example from audio axis to canvas timeline', () => {
  const runtime = buildTeamRuntime(teamTaskDefinition);

  assert.equal(runtime.taskId, '2332');
  assert.equal(runtime.currentMs, 360);
  assert.equal(runtime.durationMs, 20690);
  assert.equal(runtime.timeline.length, 4);
  assert.deepEqual(
    runtime.timeline.map((point) => `${point.type}:${point.label}`),
    [
      'speech:418-170-118',
      'board:418-170-118',
      'board:418-118-170',
      'board:288-(44+156)=288-200=88',
    ],
  );
  assert.deepEqual(
    runtime.steps.map((step) => [step.seat, step.state]),
    [
      ['A', 'done'],
      ['B', 'done'],
      ['C', 'running'],
      ['D', 'queued'],
    ],
  );
});

test('getActiveBoardBlocks exposes the current board step for the canvas', () => {
  const runtime = buildTeamRuntime(teamTaskDefinition);

  assert.deepEqual(
    getActiveBoardBlocks(runtime.boardTimeline, 360).map((block) => block.label),
    ['418-170-118'],
  );
  assert.deepEqual(
    getActiveBoardBlocks(runtime.boardTimeline, 15000).map((block) => block.label),
    ['418-118-170'],
  );
  assert.deepEqual(getActiveBoardBlocks(runtime.boardTimeline, 21000), []);
});

test('getBoardRevealProgress returns a usable reveal percentage for the active board block', () => {
  const runtime = buildTeamRuntime(teamTaskDefinition);
  const firstBlock = runtime.boardTimeline[0];

  assert.equal(getBoardRevealProgress(firstBlock, firstBlock.startTime), 0);
  assert.ok(getBoardRevealProgress(firstBlock, firstBlock.startTime + 600) > 0);
  assert.ok(getBoardRevealProgress(firstBlock, firstBlock.startTime + 600) < 1);
  assert.equal(getBoardRevealProgress(firstBlock, firstBlock.startTime + 5000), 1);
});
