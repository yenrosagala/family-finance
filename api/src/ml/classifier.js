// Multinomial Naive Bayes text classifier for category prediction.
//
// Trained offline-style from labeled (keyword -> categoryName) examples gathered
// from the bundled global dictionary plus the household's own item_dictionary
// rows (learned + user corrections weighted by confirmed count). Classification
// is pure JS / no external deps, so it runs entirely on the API server.
//
// Confidence: raw softmax posteriors are suppressed by large vocabularies, so we
// expose the log-likelihood margin between the top class and its runner-up as a
// more stable "how sure are we" signal. classifyBayes returns the top class plus
// a normalized [0,1] confidence computed from that margin.

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // keep letters+digits, drop punctuation/symbols
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// labeled: [{ keyword, categoryName, weight? }]
export function trainBayes(labeled) {
  const classCounts = {};      // categoryName -> total example weight
  const wordClassCounts = {};  // categoryName -> { token -> weight }
  const vocab = new Set();

  for (const ex of labeled) {
    const cls = ex.categoryName;
    if (!cls) continue;
    const w = typeof ex.weight === 'number' && ex.weight > 0 ? ex.weight : 1;
    classCounts[cls] = (classCounts[cls] || 0) + w;
    const tokens = tokenize(ex.keyword);
    for (const t of tokens) {
      vocab.add(t);
      if (!wordClassCounts[cls]) wordClassCounts[cls] = {};
      wordClassCounts[cls][t] = (wordClassCounts[cls][t] || 0) + w;
    }
  }

  let totalWeight = 0;
  for (const k of Object.keys(classCounts)) totalWeight += classCounts[k];

  return { classCounts, wordClassCounts, vocab, totalWeight };
}

// Returns { categoryName, confidence, margin, candidates } or null.
// margin is the log-likelihood gap (top minus runner-up) in nats.
// confidence maps margin to [0,1]: 0.5 at margin 0, rising to 1.0 at margin >=4.
export function classifyBayes(model, text) {
  if (!model || model.totalWeight <= 0) return null;
  const tokens = tokenize(text);
  if (tokens.length === 0) return null;

  const classes = Object.keys(model.classCounts);
  if (classes.length === 0) return null;

  const vocabSize = model.vocab.size;
  const scored = classes.map((cls) => {
    const classWeight = model.classCounts[cls];
    let logProb = Math.log(classWeight / model.totalWeight);
    for (const t of tokens) {
      const n = (model.wordClassCounts[cls] && model.wordClassCounts[cls][t]) || 0;
      logProb += Math.log((n + 1) / (classWeight + vocabSize)); // Laplace smoothing
    }
    return { cls, logProb };
  });

  scored.sort((a, b) => b.logProb - a.logProb);
  const top = scored[0];
  const runner = scored[1];
  const margin = top.logProb - runner.logProb;
  const confidence = 0.5 + 0.5 * Math.min(1, margin / 4);

  return {
    categoryName: top.cls,
    logProb: top.logProb,
    margin,
    confidence,
    candidates: scored.slice(0, 3).map((s) => ({ categoryName: s.cls, logProb: s.logProb })),
  };
}
