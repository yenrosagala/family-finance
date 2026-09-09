import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyBayes, trainBayes, tokenize } from './classifier.js';

// Small labeled dataset mirroring the bundled global dictionary shape.
const GLOBAL = [
  { keyword: 'indomie', categoryName: 'Groceries' },
  { keyword: 'beras', categoryName: 'Groceries' },
  { keyword: 'gula', categoryName: 'Groceries' },
  { keyword: 'telur', categoryName: 'Groceries' },
  { keyword: 'teh botol', categoryName: 'Food & Drinks' },
  { keyword: 'kopi', categoryName: 'Food & Drinks' },
  { keyword: 'bakso', categoryName: 'Food & Drinks' },
  { keyword: 'bensin', categoryName: 'Transportation' },
  { keyword: 'pertalite', categoryName: 'Transportation' },
  { keyword: 'listrik', categoryName: 'Bills & Utilities' },
  { keyword: 'pulsa', categoryName: 'Bills & Utilities' },
];

function trainGlobal() {
  return trainBayes(GLOBAL);
}

test('tokenize drops punctuation and lowercases', () => {
  assert.deepEqual(tokenize('  Indomie! Goreng 2024 '), ['indomie', 'goreng', '2024']);
  assert.equal(tokenize('').length, 0);
});

test('classifies an unseen keyword into its nearest category (exact-signal)', () => {
  const model = trainGlobal();
  const res = classifyBayes(model, 'indomie');
  assert.ok(res);
  assert.equal(res.categoryName, 'Groceries');
  assert.ok(res.confidence > 0.3);
});

test('classifies multi-word / fuzzy-related term (Food & Drinks)', () => {
  const model = trainGlobal();
  const res = classifyBayes(model, 'teh botol sosro');
  assert.equal(res.categoryName, 'Food & Drinks');
});

test('learned/higher-weighted example dominates conflicting term', () => {
  // 'bensin' is Transportation; add a strongly-confirmed user correction to Groceries
  const model = trainBayes([
    ...GLOBAL,
    { keyword: 'bensin', categoryName: 'Groceries', weight: 50 }, // user correction, high confidence
  ]);
  const res = classifyBayes(model, 'bensin');
  assert.equal(res.categoryName, 'Groceries');
});

test('returns null on empty model or empty input', () => {
  assert.equal(classifyBayes({ classCounts: {}, wordClassCounts: {}, vocab: new Set(), totalWeight: 0 }, 'anything'), null);
  assert.equal(classifyBayes(trainGlobal(), '   '), null);
});

test('margin separates confident vs ambiguous predictions', () => {
  const model = trainGlobal();
  const confident = classifyBayes(model, 'indomie');       // strong Groceries signal
  const ambiguous = classifyBayes(model, 'uang sekolah');  // matches several classes ~equally
  assert.ok(confident.margin > ambiguous.margin, 'confident example must have larger margin than ambiguous one');
  assert.ok(confident.confidence > 0.6, 'high-margin prediction should be confident');
  assert.ok(ambiguous.confidence < confident.confidence);
  assert.ok(confident.candidates.length >= 2);
});

