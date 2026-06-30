const { getEnabledRules } = require('./database');

function matchPattern(pattern, value) {
  if (!pattern) return true;
  if (pattern === '*') return true;

  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\\\*/g, '.*') + '$';
  try {
    return new RegExp(regexStr, 'i').test(value || '');
  } catch {
    return pattern.toLowerCase() === (value || '').toLowerCase();
  }
}

function findMatchingRules(sender) {
  const rules = getEnabledRules();
  const matches = [];

  for (const rule of rules) {
    const senderMatch = matchPattern(rule.sender_pattern, sender);
    if (senderMatch) {
      matches.push(rule);
    }
  }

  return matches;
}

module.exports = { findMatchingRules, matchPattern };
