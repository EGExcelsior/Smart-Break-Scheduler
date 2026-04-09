function normalizeForMatching(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUnitCategory(unitName) {
  const lower = unitName.toLowerCase();

  if (lower.includes('entrance') || lower.includes('admissions')) return 'Admissions';
  // Sweet Shop and Ben & Jerry's are Retail
  if (
    lower.includes('shop') ||
    lower.includes('retail') ||
    lower.includes('kiosk') ||
    lower.includes('barrow') ||
    lower.includes('freestyle') ||
    lower.includes('vending') ||
    lower.includes('treats') ||
    lower.includes('sealife') ||
    lower.includes('lorikeets') ||
    lower.includes('explorer supplies')
  ) {
    return 'Retail';
  }
  if (lower.includes('car park')) return 'Car Parks';
  if (lower.includes('ghi')) return 'GHI';
  if (lower.includes('break cover')) return 'Break Cover';

  return 'Rides';
}

function groupStaffByUnit(assignments, staffList) {
  const unitGroups = new Map();

  for (const staff of staffList) {
    if (staff.unassigned) continue;

    const staffAssignments = assignments.filter(
      (a) =>
        normalizeForMatching(a.staff) === normalizeForMatching(staff.name) &&
        !a.isBreak &&
        a.unit !== 'Zonal Lead'
    );

    if (staffAssignments.length === 0) continue;

    // Use the longest assignment (by duration) as the primary grouping unit.
    // If tie, prefer Retail/Admissions over Rides.
    let maxDuration = -1;
    let candidateUnits = [];
    for (const a of staffAssignments) {
      if (a.unit === 'Azteca Entrance') continue; // skip temporary early opening stints
      const [sh, sm] = a.startTime.split(':').map(Number);
      const [eh, em] = a.endTime.split(':').map(Number);
      const duration = (eh * 60 + em) - (sh * 60 + sm);
      if (duration > maxDuration) {
        maxDuration = duration;
        candidateUnits = [a.unit];
      } else if (duration === maxDuration) {
        candidateUnits.push(a.unit);
      }
    }
    let primaryUnit = null;
    if (candidateUnits.length === 1) {
      primaryUnit = candidateUnits[0];
    } else if (candidateUnits.length > 1) {
      // Prefer Retail/Admissions over Rides in case of tie
      primaryUnit = candidateUnits.find(u => {
        const cat = getUnitCategory(u);
        return cat === 'Retail' || cat === 'Admissions';
      }) || candidateUnits[0];
    }
    if (primaryUnit) {
      if (!unitGroups.has(primaryUnit)) {
        unitGroups.set(primaryUnit, []);
      }
      unitGroups.get(primaryUnit).push(staff.name);
    }
  }

  return { unitGroups };
}

function getSortedUnits(unitGroups) {
  const categoryOrder = {
    Rides: 1,
    Retail: 2,
    Admissions: 3,
    'Car Parks': 4,
    GHI: 5,
    'Break Cover': 6
  };

  return Array.from(unitGroups.keys()).sort((a, b) => {
    const catA = getUnitCategory(a);
    const catB = getUnitCategory(b);

    const orderA = categoryOrder[catA] || 99;
    const orderB = categoryOrder[catB] || 99;

    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
}

function splitStaffBySection(sortedUnits, unitGroups) {
  const ridesStaff = [];
  const retailStaff = [];
  const carParksGhiStaff = [];

  for (const unitName of sortedUnits) {
    const staffInUnit = unitGroups.get(unitName);
    if (!staffInUnit || staffInUnit.length === 0) continue;

    const category = getUnitCategory(unitName);
    const isRidesSection = category === 'Rides' || unitName.toLowerCase().includes('rides break cover');
    const isCarParksGhi = category === 'Car Parks' || category === 'GHI';

    let targetArray;
    if (isRidesSection) targetArray = ridesStaff;
    else if (isCarParksGhi) targetArray = carParksGhiStaff;
    else targetArray = retailStaff;

    for (const staffName of staffInUnit) {
      if (!targetArray.includes(staffName)) {
        targetArray.push(staffName);
      }
    }
  }

  return {
    ridesStaff,
    retailStaff,
    carParksGhiStaff
  };
}

module.exports = {
  normalizeForMatching,
  getUnitCategory,
  groupStaffByUnit,
  getSortedUnits,
  splitStaffBySection
};
