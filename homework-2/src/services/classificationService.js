/**
 * Rule-based ticket auto-classification.
 *
 * All keyword rules live in CLASSIFICATION_CONFIG — add new categories or
 * keywords there without touching the algorithm.
 *
 * Confidence formula
 * ------------------
 *   category_score = matched_keywords_in_winning_category / keywords_in_that_category
 *                    (0 when no category keyword is found; falls back to "other")
 *   priority_score = 1 if any priority keyword matched, 0 if defaulting to "medium"
 *   confidence     = (category_score × 0.7) + (priority_score × 0.3)
 *
 * The 70/30 split reflects that category is the primary classification signal.
 * Range: 0 (no signals at all) → 1 (all winning-category + a priority keyword matched).
 */

export const CLASSIFICATION_CONFIG = {
  categories: {
    account_access: ['login', 'password', 'sign in', '2fa', 'locked out'],
    technical_issue: ['error', 'crash', 'not working', 'broken', 'exception'],
    billing_question: ['payment', 'invoice', 'refund', 'charge', 'subscription'],
    feature_request: ['please add', 'would be nice', 'suggestion', 'enhancement'],
    bug_report: ['bug', 'reproduce', 'steps', 'unexpected behavior'],
  },
  priorities: {
    urgent: ["can't access", 'critical', 'production down', 'security'],
    high: ['important', 'blocking', 'asap'],
    low: ['minor', 'cosmetic', 'suggestion'],
    // 'medium' is the implicit default when nothing matches
  },
};

/** In-memory log of every classification decision keyed by ticket id. */
const decisionLog = [];

function findMatches(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw));
}

/**
 * Classify a ticket by scanning subject + description against CLASSIFICATION_CONFIG.
 *
 * @param {string} subject
 * @param {string} description
 * @returns {{ category, priority, confidence, reasoning, keywords_found: string[] }}
 */
export function classify(subject, description) {
  const text = `${subject} ${description}`;

  // --- Category: pick the category with the most keyword hits ---
  let topCategory = 'other';
  let topMatches = [];
  let topKeywords = [];

  for (const [cat, keywords] of Object.entries(CLASSIFICATION_CONFIG.categories)) {
    const matches = findMatches(text, keywords);
    if (matches.length > topMatches.length) {
      topCategory = cat;
      topMatches = matches;
      topKeywords = keywords;
    }
  }

  const categoryScore =
    topMatches.length > 0 ? topMatches.length / topKeywords.length : 0;

  // --- Priority: first match wins (urgent > high > low); default = medium ---
  let topPriority = 'medium';
  let priorityMatches = [];

  for (const level of ['urgent', 'high', 'low']) {
    const matches = findMatches(text, CLASSIFICATION_CONFIG.priorities[level]);
    if (matches.length > 0) {
      topPriority = level;
      priorityMatches = matches;
      break;
    }
  }

  const priorityScore = priorityMatches.length > 0 ? 1 : 0;

  const confidence = parseFloat(
    (categoryScore * 0.7 + priorityScore * 0.3).toFixed(4)
  );

  const keywords_found = [...topMatches, ...priorityMatches];

  const reasoning = buildReasoning(topCategory, topMatches, topPriority, priorityMatches);

  return { category: topCategory, priority: topPriority, confidence, reasoning, keywords_found };
}

function buildReasoning(category, categoryMatches, priority, priorityMatches) {
  const parts = [];

  if (categoryMatches.length > 0) {
    parts.push(
      `Category "${category}" matched ${categoryMatches.length} keyword(s): [${categoryMatches.join(', ')}].`
    );
  } else {
    parts.push('No category keywords matched; defaulting to "other".');
  }

  if (priorityMatches.length > 0) {
    parts.push(
      `Priority "${priority}" triggered by keyword(s): [${priorityMatches.join(', ')}].`
    );
  } else {
    parts.push('No priority keywords matched; defaulting to "medium".');
  }

  return parts.join(' ');
}

/**
 * Append a classification decision to the in-memory log and emit it to console.
 *
 * @param {string} ticketId
 * @param {{ subject: string, description: string }} inputs
 * @param {object} result  Output from classify() or a manual-override descriptor.
 * @param {'auto'|'manual_override'} source
 */
export function logDecision(ticketId, inputs, result, source = 'auto') {
  const entry = {
    ticket_id: ticketId,
    timestamp: new Date().toISOString(),
    source,
    inputs: { subject: inputs.subject, description: inputs.description },
    result,
  };
  decisionLog.push(entry);
  console.log('[classification]', JSON.stringify(entry));
}

/**
 * Return all log entries for a ticket (oldest first).
 *
 * @param {string} ticketId
 * @returns {object[]}
 */
export function getDecisionLog(ticketId) {
  return decisionLog.filter((e) => e.ticket_id === ticketId);
}
