import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Opt-in integration check: the synthetic inactive user is never committed.
if (!process.argv.includes('--rollback-test')) throw new Error('Pass --rollback-test explicitly');
const db = new PrismaClient();
const id = `history-check-${randomUUID()}`;
const rollback = new Error('intentional test rollback');
try {
  try {
    await db.$transaction(async (tx) => {
      const initial = await tx.user.create({ data: { id, fullName: 'History Test', gender: '', isActive: false } });
      assert.equal(initial.nameChangeCount, 0);
      assert.equal(initial.lastNameChangedAt, null);
      await tx.user.update({ where: { id }, data: { fullName: 'History Test', bio: 'No name change' } });
      let user = await tx.user.findUniqueOrThrow({ where: { id } });
      assert.equal(user.nameChangeCount, 0);
      await tx.user.update({ where: { id }, data: { fullName: 'History Renamed' } });
      user = await tx.user.findUniqueOrThrow({ where: { id } });
      assert.equal(user.nameChangeCount, 1);
      assert.ok(user.lastNameChangedAt);
      const changedAt = user.lastNameChangedAt.getTime();
      await tx.user.update({ where: { id }, data: { fullName: ' History Renamed ', nameChangeCount: 99 } });
      user = await tx.user.findUniqueOrThrow({ where: { id } });
      assert.equal(user.nameChangeCount, 1);
      assert.equal(user.lastNameChangedAt.getTime(), changedAt);
      assert.equal(user.nameHistoryStartedAt.getTime(), initial.nameHistoryStartedAt.getTime());
      await tx.user.update({ where: { id }, data: { fullName: 'history renamed' } });
      user = await tx.user.findUniqueOrThrow({ where: { id } });
      assert.equal(user.nameChangeCount, 2);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await db.user.count({ where: { id } }), 0);
  console.log('Name-history trigger verified; synthetic account rolled back.');
} finally {
  await db.$disconnect();
}
