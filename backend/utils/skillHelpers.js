const { canonicalizeUnitName, getCategoryFromUnit } = require('./unitHelpers');

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

function normalizeRideName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function getStaffTrainedUnits(staff) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return [];
  }

  const trainedUnits = [];

  for (const skill of staff.greenUnits) {
    const parts = skill.split('-');
    if (parts.length < 2) continue;

    const skillType = parts[parts.length - 1];
    const unitName = parts.slice(0, -1).join('-');

    trainedUnits.push({
      unit: unitName.trim(),
      skillType: skillType,
      fullSkill: skill
    });
  }

  return trainedUnits;
}

function getGenericSkillMatch(unitName, requiredPosition) {
  const unitLower = unitName.toLowerCase();
  const canonicalUnit = canonicalizeUnitName(unitName);
  const skillType = matchPositionToSkill(requiredPosition);

  if (unitLower.includes('car park') || unitLower.includes('car parks')) {
    return `Car Parks Skill-${skillType}`;
  }

  if (unitLower.includes('admissions') || unitLower.includes('entrance') || unitLower.includes('schools')) {
    return `Admissions Skill-${skillType}`;
  }

  if (unitLower.includes('ghi')) {
    return `GHI ${skillType}`;
  }

  if (unitLower.includes('sweet shop')) {
    return `Sweet Shop-${skillType}`;
  }
  if (canonicalUnit === 'Sealife') {
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

  if (unitLower.includes('retail') || unitLower.includes('lorikeets')) {
    return `Retail-${skillType}`;
  }

  if (unitLower.includes('break cover')) {
    return `Break Cover-${skillType}`;
  }

  return null;
}

function staffHasSkill(staff, unitName, requiredPosition) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return false;
  }

  const normalizedUnit = normalizeRideName(unitName);
  const skillType = matchPositionToSkill(requiredPosition);

  const genericSkill = getGenericSkillMatch(unitName, requiredPosition);
  if (genericSkill) {
    for (const staffSkill of staff.greenUnits) {
      if (staffSkill.trim() === genericSkill) {
        return true;
      }
    }
  }

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

function hasSkillForUnit(staffName, targetUnit, skillsData) {
  const staff = skillsData.staffWithGreen.find(s => s.name === staffName);
  if (!staff) return false;
  const canonicalTargetUnit = canonicalizeUnitName(targetUnit);

  const category = getCategoryFromUnit(canonicalTargetUnit);
  if (category === 'Rides') {
    return true;
  }

  const unitSkillMap = {
    'Lodge Entrance': 'Admissions', 'Azteca Entrance': 'Admissions', 'Explorer Entrance': 'Admissions', 'Schools Entrance': 'Admissions',
    'Adventures Point Gift Shop': 'Adventure Point Gift Shop', 'Sweet Shop': 'Sweet Shop', 'Sealife': 'Sea Life', 'Lorikeets': 'Retail',
    'Car Parks - Staff Car Park': 'Car Parks', 'Car Parks - Hotel Car Park': 'Car Parks', 'Car Parks - Express': 'Car Parks',
    'Car Parks - Split': 'Car Parks', 'Car Parks - Flamingo': 'Car Parks', 'Car Parks - Giraffe': 'Car Parks', 'Car Parks - Gorilla': 'Car Parks',
    "Ben & Jerry's": "Ben & Jerry's",
    "Ben & Jerry's Kiosk": "Ben & Jerry's"
  };

  const requiredSkill = unitSkillMap[canonicalTargetUnit];
  if (!requiredSkill) return false;

  return (staff.greenUnits || []).some(skill => {
    if (!skill) return false;
    const skillStr = typeof skill === 'string' ? skill : (skill.fullSkill || '');
    return skillStr.toLowerCase().includes(requiredSkill.toLowerCase());
  });
}

module.exports = {
  matchPositionToSkill,
  getStaffTrainedUnits,
  getGenericSkillMatch,
  staffHasSkill,
  hasSkillForUnit
};