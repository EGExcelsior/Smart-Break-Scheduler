/**
 * Name Matching Utility
 * Handles fuzzy matching between Skills Matrix names and TimeGrip names
 * 
 * Examples:
 * - "Cai Tinsley" matches "Cai Tinsley Cullip"
 * - "Daniel McCarthy" matches "Daniel McCarthy"
 * - Handles middle names, suffixes, etc.
 * 
 * @module nameMatching
 * @version 1.0
 */

/**
 * Normalize a name for comparison
 * - Converts to lowercase
 * - Removes extra spaces
 * - Splits into tokens (words)
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return [];
  
  return name
    .toLowerCase()
    .trim()
    .replace(/'/g, '')  // Remove apostrophes (O'Donovan → ODonovan)
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')  // Remove suffixes
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(token => token.length > 0);
}

/**
 * Check if two names are similar (1-2 character difference)
 * Handles spelling variations like "Osborne" vs "Osbourne"
 * Uses a simple Levenshtein-like approach
 */
function areNamesSimilar(name1, name2) {
  if (name1 === name2) return true;
  
  const len1 = name1.length;
  const len2 = name2.length;
  
  // If length difference > 2, not similar
  if (Math.abs(len1 - len2) > 2) return false;
  
  // Check if one is a substring of the other (handles some cases)
  if (name1.includes(name2) || name2.includes(name1)) return true;
  
  // Calculate edit distance (simplified Levenshtein)
  const editDistance = calculateEditDistance(name1, name2);
  return editDistance <= 2;
}

/**
 * Calculate simple edit distance between two strings
 * (insertions, deletions, substitutions)
 */
function calculateEditDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Create a matrix
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  // Fill the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j - 1] + 1  // substitution
        );
      }
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Check if two names match
 * 
 * Strategy:
 * 1. Exact match → TRUE
 * 2. First name + Last name match → TRUE (ignoring middle names)
 * 3. All tokens from shorter name appear in longer name → TRUE
 * 
 * @param {string} name1 - First name (e.g., from Skills Matrix)
 * @param {string} name2 - Second name (e.g., from TimeGrip)
 * @returns {boolean} Whether names match
 */
function namesMatch(name1, name2) {
  if (!name1 || !name2) return false;
  
  // Exact match (case-insensitive)
  if (name1.toLowerCase().trim() === name2.toLowerCase().trim()) {
    return true;
  }
  
  const tokens1 = normalizeName(name1);
  const tokens2 = normalizeName(name2);
  
  if (tokens1.length === 0 || tokens2.length === 0) return false;
  
  // Strategy 1: First + Last name match (most common case)
  // "Cai Tinsley" vs "Cai Tinsley Cullip"
  // First name (tokens[0]) and last name (tokens[last]) must match
  if (tokens1.length >= 2 && tokens2.length >= 2) {
    const firstName1 = tokens1[0];
    const lastName1 = tokens1[tokens1.length - 1];
    const firstName2 = tokens2[0];
    const lastName2 = tokens2[tokens2.length - 1];
    
    // Exact first+last match
    if (firstName1 === firstName2 && lastName1 === lastName2) {
      return true;
    }
    
    // ✅ NEW: Fuzzy last name match (handles Osborne vs Osbourne, 1-2 char difference)
    if (firstName1 === firstName2 && areNamesSimilar(lastName1, lastName2)) {
      return true;
    }
  }
  
  // Strategy 2: All tokens from shorter name must appear in longer name
  // This handles middle names, suffixes, etc.
  const [shorter, longer] = tokens1.length <= tokens2.length 
    ? [tokens1, tokens2] 
    : [tokens2, tokens1];
  
  const allTokensPresent = shorter.every(token => longer.includes(token));
  
  if (allTokensPresent) {
    return true;
  }
  
  return false;
}

/**
 * Find a staff member in TimeGrip data by name
 * Uses fuzzy matching to handle name variations
 * 
 * @param {string} staffName - Name from Skills Matrix
 * @param {Array} timegripStaff - Array of staff from TimeGrip
 * @returns {object|null} Matching staff member or null
 */
function findStaffInTimeGrip(staffName, timegripStaff) {
  if (!staffName || !timegripStaff || timegripStaff.length === 0) {
    return null;
  }
  
  for (const tgStaff of timegripStaff) {
    if (namesMatch(staffName, tgStaff.name)) {
      return tgStaff;
    }
  }
  
  return null;
}

module.exports = {
  namesMatch,
  findStaffInTimeGrip,
  normalizeName
};
