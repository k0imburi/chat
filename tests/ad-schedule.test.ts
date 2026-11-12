import assert from 'node:assert/strict';
import test from 'node:test';
import {startAdSchedule} from '../lib/ad-schedule';

test('draft and review delays do not consume purchased duration', () => {
  const now = new Date('2026-10-17T10:00:00Z');
  const result = startAdSchedule({publishedAt:null, startDate:new Date('2026-10-10'), endDate:new Date('2026-10-13')}, now);
  assert.equal(result.startDate?.toISOString(), now.toISOString());
  assert.equal(result.endDate?.toISOString(), '2026-10-20T10:00:00.000Z');
  assert.equal(result.publishedAt, now);
});

test('resuming an already published campaign does not restart its clock', () => {
  assert.deepEqual(startAdSchedule({publishedAt:new Date('2026-10-10'),startDate:new Date('2026-10-10'),endDate:new Date('2026-10-13')}), {});
});

test('publication preserves a future scheduled start', () => {
  const result = startAdSchedule({publishedAt:null,startDate:new Date('2026-10-20'),endDate:new Date('2026-10-23')},new Date('2026-10-17'));
  assert.equal(result.startDate?.toISOString(),'2026-10-20T00:00:00.000Z');
  assert.equal(result.endDate?.toISOString(),'2026-10-23T00:00:00.000Z');
});
