const { UNIT_CATEGORIES } = require('../config/constants');

const TEAM_UNIT_EXCLUSIONS = {
  nexus: new Set(['Dragon Treats', "Ben & Jerry's Kiosk"])
};

function normalizeTeamKey(teamName) {
  if (!teamName) {
    return '';
  }
  return String(teamName).toLowerCase().replace(/^team\s+/, '').trim();
}

function canonicalizeUnitName(unitName) {
  if (!unitName || typeof unitName !== 'string') {
    return unitName;
  }

  let compact = unitName.trim().replace(/\s+/g, ' ');
  compact = compact.replace(/^(nexus|odyssey|phantom)\s+/i, '');
  const lower = compact.toLowerCase();

  if (lower === 'sea life' || lower === 'sealife') {
    return 'Sealife';
  }

  if (lower === 'freestyle and vending' || lower === 'freestyle & vending') {
    return 'Freestyle & Vending';
  }

  return compact;
}

function getExcludedUnitsForTeam(teamName) {
  const teamKey = normalizeTeamKey(teamName);
  return TEAM_UNIT_EXCLUSIONS[teamKey] || new Set();
}

function filterUnitsForTeam(unitsByCategory, teamName) {
  const excludedUnits = getExcludedUnitsForTeam(teamName);
  if (excludedUnits.size === 0) {
    return unitsByCategory;
  }

  const filtered = {};
  for (const [category, unitList] of Object.entries(unitsByCategory)) {
    const nextUnitList = unitList.filter((unit) => !excludedUnits.has(unit.name));
    if (nextUnitList.length > 0) {
      filtered[category] = nextUnitList;
    }
  }

  return filtered;
}

function getCategoryFromUnit(unitName) {
  const canonicalUnit = canonicalizeUnitName(unitName);
  const canonicalLower = typeof canonicalUnit === 'string' ? canonicalUnit.toLowerCase() : '';

  if (canonicalLower.includes('zonal lead')) {
    return 'Zonal Leads';
  }

  if (canonicalLower.includes('break cover')) {
    return 'Break Cover';
  }

  if (canonicalLower.startsWith('car parks')) {
    return 'Car Parks';
  }

  if (canonicalLower.startsWith('ghi')) {
    return 'GHI';
  }

  if (canonicalLower.includes('freestyle') || canonicalLower.includes('vending')) {
    return 'Retail';
  }

  for (const [category, unitList] of Object.entries(UNIT_CATEGORIES)) {
    if (unitList.some((unit) => canonicalizeUnitName(unit) === canonicalUnit)) {
      return category;
    }
  }
  return 'Retail';
}

module.exports = {
  TEAM_UNIT_EXCLUSIONS,
  normalizeTeamKey,
  canonicalizeUnitName,
  getExcludedUnitsForTeam,
  filterUnitsForTeam,
  getCategoryFromUnit
};