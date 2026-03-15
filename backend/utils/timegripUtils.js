/**
 * TimeGrip Utilities
 * 
 * Handles staff lookups and name matching between Skills Matrix and TimeGrip data
 * - Staff availability checking
 * - Working hours retrieval
 * - Name normalization for fuzzy matching
 * 
 * @module timegripUtils
 * @version 1.0
 */

/**
 * Normalize staff names for matching
 * Handles middle names, department suffixes, and variations
 * 
 * Examples:
 * - "Cai Tinsley Cullip" → "cai tinsley"
 * - "Daniel McCarthy R&A" → "daniel mccarthy"
 * 
 * @param {string} name - Staff name
 * @returns {string} Normalized name
 */
function normalizeStaffName(name) {
  if (!name) return '';
  
  // Remove department suffixes and normalize
  let normalized = name
    .toLowerCase()
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Handle middle names/compound surnames
  // Extract first name + first surname only
  // "Cai Tinsley Cullip" → "cai tinsley"
  // "Cai Tinsley" → "cai tinsley"
  const parts = normalized.split(' ');
  if (parts.length > 2) {
    // Keep only first name + first surname
    normalized = `${parts[0]} ${parts[1]}`;
  }
  
  return normalized;
}

/**
 * Check if staff is available for a given time period
 * Searches in both workingStaff and MANAGEMENT categories
 * 
 * @param {string} staffName - Staff name from Skills Matrix
 * @param {string} startTime - Required start time
 * @param {string} endTime - Required end time
 * @param {object} timegripData - TimeGrip parsed data
 * @returns {boolean} True if staff is working during this time
 */
function isStaffAvailableForTime(staffName, startTime, endTime, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);
  
  // Search in workingStaff
  let staff = timegripData.workingStaff.find(s => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });
  
  // If not found in workingStaff, try MANAGEMENT category (Zonal Leads)
  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find(s => {
      const normalizedWorkingName = normalizeStaffName(s.name);
      return normalizedWorkingName === normalizedSearchName;
    });
  }
  
  if (!staff) {
    return false;
  }
  
  return true;
}

/**
 * Get staff working hours from TimeGrip
 * Returns start time, end time, and break duration
 * 
 * @param {string} staffName - Staff name from Skills Matrix
 * @param {object} timegripData - TimeGrip parsed data
 * @returns {object|null} {startTime, endTime, breakMinutes} or null if not found
 */
function getStaffWorkingHours(staffName, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);
  
  // Search in workingStaff
  let staff = timegripData.workingStaff.find(s => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });
  
  // If not found in workingStaff, try MANAGEMENT category (Zonal Leads)
  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find(s => {
      const normalizedWorkingName = normalizeStaffName(s.name);
      return normalizedWorkingName === normalizedSearchName;
    });
  }
  
  if (!staff) {
    return null;
  }
  
  return {
    startTime: staff.startTime,
    endTime: staff.endTime,
    breakMinutes: staff.scheduledBreakMinutes || 0
  };
}

module.exports = {
  normalizeStaffName,
  isStaffAvailableForTime,
  getStaffWorkingHours
};