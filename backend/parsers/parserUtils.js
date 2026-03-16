function toTrimmedString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function toLowerTrimmed(value) {
  return toTrimmedString(value).toLowerCase();
}

function normalizeNameKey(value) {
  return toLowerTrimmed(value);
}

module.exports = {
  toTrimmedString,
  toLowerTrimmed,
  normalizeNameKey
};