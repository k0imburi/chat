import assert from 'node:assert/strict';
import test from 'node:test';
import {adCtaLabels,normalizeAdCtaLabel} from '../lib/ad-cta';

test('normalizes CTA casing accepted by older clients', () => {
  assert.equal(normalizeAdCtaLabel('Learn more'), 'Learn More');
  assert.equal(normalizeAdCtaLabel(' learn MORE '), 'Learn More');
});

test('every advertised CTA remains a valid canonical option', () => {
  for (const label of adCtaLabels) {
    assert.equal(normalizeAdCtaLabel(label), label);
  }
});
