/**
 * Skill Matching Utility
 * 
 * Handles all skill validation and matching logic for staff assignments
 * - Position type matching (Operator vs Attendant vs Host)
 * - Ride name normalization
 * - Generic skill matching (Retail, Admissions, Car Parks, etc.)
 * - Staff skill validation
 * 
 * @module skillMatching
 * @version 1.0
 */

/**
 * Match a position to a skill type abbreviation
 * Maps position names like "Operator" → "OP", "Attendant" → "ATT", etc.
 * 
 * @param {string} zonePosition - Position from zone file (e.g., "Room on the Broom - Operator")
 * @returns {string|null} Skill type abbreviation (OP, ATT, HOST, Driver) or original position
 */
function matchPositionToSkill(zonePosition) {
  if (!zonePosition) return null;
  
  const posLower = zonePosition.toLowerCase();
  
  if (posLower.includes('attendant')) {
    return 'ATT';
  }
  
  if (posLower.includes('operator')) {
    return 'OP';
  }
  
  if (posLower.includes('host')) {
    return 'HOST';
  }
  
  if (posLower.includes('driver')) {
    return 'Driver';
  }
  
  return zonePosition;
}

/**
 * Normalize ride/unit name for comparison
 * Removes apostrophes, spaces, and converts to lowercase
 * 
 * @param {string} name - Ride or unit name
 * @returns {string} Normalized name
 */
function normalizeRideName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Check if staff has a SPECIFIC unit skill (not generic)
 * Looks for exact unit match in staff's green skills
 * 
 * @param {object} staff - Staff object with greenUnits array
 * @param {string} unitName - Unit name to check
 * @returns {boolean} True if staff has specific skill for this unit
 */
function hasSpecificUnitSkill(staff, unitName) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return false;
  }
  
  const normalizedUnit = normalizeRideName(unitName);
  
  for (const skill of staff.greenUnits) {
    const normalizedSkill = normalizeRideName(skill.split('-')[0]);
    
    if (normalizedSkill === normalizedUnit) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get all specific units/rides a staff member is trained on
 * Parses skills format like "UnitName-OP", "UnitName-HOST"
 * 
 * @param {object} staff - Staff object with greenUnits array
 * @returns {Array} Array of {unit, skillType, fullSkill} objects
 */
function getStaffTrainedUnits(staff) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return [];
  }
  
  const trainedUnits = [];
  
  for (const skill of staff.greenUnits) {
    // Parse skill format: "UnitName-OP" or "UnitName-HOST" or "UnitName-ATT"
    const parts = skill.split('-');
    if (parts.length < 2) continue;
    
    const skillType = parts[parts.length - 1]; // OP, HOST, ATT, etc.
    const unitName = parts.slice(0, -1).join('-'); // Everything before the last -
    
    trainedUnits.push({
      unit: unitName.trim(),
      skillType: skillType,
      fullSkill: skill
    });
  }
  
  return trainedUnits;
}

/**
 * Get generic skill match for a unit
 * Maps units to generic skill categories (Car Parks, Admissions, Retail, etc.)
 * 
 * IMPORTANT: Car Parks must be checked FIRST before Schools to avoid confusion
 * 
 * @param {string} unitName - Unit name
 * @param {string} requiredPosition - Position name
 * @returns {string|null} Generic skill name or null
 */
function getGenericSkillMatch(unitName, requiredPosition) {
  const unitLower = unitName.toLowerCase();
  const skillType = matchPositionToSkill(requiredPosition);
  
  // ✅ CAR PARKS FIRST - Must check before schools to avoid confusion
  if (unitLower.includes('car park') || unitLower.includes('car parks')) {
    return `Car Parks Skill-${skillType}`;
  }
  
  // Admissions (including schools)
  if (unitLower.includes('admissions') || unitLower.includes('entrance') || unitLower.includes('schools')) {
    return `Admissions Skill-${skillType}`;
  }
  
  // GHI
  if (unitLower.includes('ghi')) {
    return `GHI ${skillType}`;
  }
  
  // SPECIFIC retail units
  if (unitLower.includes('sweet shop')) {
    return `Sweet Shop-${skillType}`;
  }
  if (unitLower.includes('sealife') || unitLower.includes('sea life')) {
    return `Sea Life-${skillType}`;
  }
  if (unitLower.includes('ben') && unitLower.includes('jerry')) {
    return `Ben and Jerry's Kiosk-${skillType}`;
  }
  if (unitLower.includes('explorer')) {
    return `Explorer Unit-${skillType}`;
  }
  if (unitLower.includes('barrows')) {
    return `Barrows-${skillType}`;
  }
  if (unitLower.includes('kiosk') && !unitLower.includes('ben')) {
    return `Kiosk-${skillType}`;
  }
  if (unitLower.includes('gift shop')) {
    return `Gift Shop-${skillType}`;
  }
  
  // Generic fallback for Lorikeets and other retail
  if (unitLower.includes('retail') || unitLower.includes('lorikeets')) {
    return `Retail-${skillType}`;
  }
  
  // Break Cover
  if (unitLower.includes('break cover')) {
    return `Break Cover-${skillType}`;
  }
  
  return null;
}

/**
 * Check if staff has skill for a unit (including generic skills)
 * Checks both specific unit skills AND generic skill categories
 * 
 * @param {object} staff - Staff object with greenUnits array
 * @param {string} unitName - Unit name to check
 * @param {string} requiredPosition - Position name
 * @returns {boolean} True if staff has skill (specific or generic)
 */
function staffHasSkill(staff, unitName, requiredPosition) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return false;
  }
  
  const normalizedUnit = normalizeRideName(unitName);
  const skillType = matchPositionToSkill(requiredPosition);
  
  // Check generic skills
  const genericSkill = getGenericSkillMatch(unitName, requiredPosition);
  if (genericSkill) {
    for (const staffSkill of staff.greenUnits) {
      if (staffSkill.trim() === genericSkill) {
        return true;
      }
    }
  }
  
  // Check specific ride skills
  for (const skillKey of staff.greenUnits) {
    const parts = skillKey.split('-');
    if (parts.length < 2) continue;
    
    const skillRide = parts.slice(0, -1).join('-');
    const skillPosition = parts[parts.length - 1];
    
    const normalizedSkillRide = normalizeRideName(skillRide);
    
    if (normalizedSkillRide === normalizedUnit && skillPosition === skillType) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if units match for break cover assignment
 * Normalizes unit names and checks for matches
 * 
 * @param {string} skillUnit - Unit from staff's skills
 * @param {string} breakUnit - Unit that needs break cover
 * @returns {boolean} True if units match
 */
function unitsMatchForBreakCover(skillUnit, breakUnit) {
  const normalize = (str) => str
    .toLowerCase()
    .replace(/-op|-att|-host|operator|attendant|host|driver|skill/gi, '')
    .replace(/\s+/g, '')
    .trim();
  
  const skillNorm = normalize(skillUnit);
  const breakNorm = normalize(breakUnit);
  
  return skillNorm === breakNorm ||
         skillNorm.includes(breakNorm) ||
         breakNorm.includes(skillNorm);
}

module.exports = {
  matchPositionToSkill,
  normalizeRideName,
  hasSpecificUnitSkill,
  getStaffTrainedUnits,
  getGenericSkillMatch,
  staffHasSkill,
  unitsMatchForBreakCover
};