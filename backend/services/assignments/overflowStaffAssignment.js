'use strict';

const { isRetailLikeUnit } = require('../../utils/unitHelpers');

/**
 * STEP 5: Assign Overflow Staff to Busy Units (Allow Overstaffing)
 *
 * Distributes remaining retail/admissions staff to entrance and shop units
 * after Steps 1-4 have filled mandatory requirements.
 * Short-shift ("Home @1") staff always go to Lodge Entrance for morning cover.
 * Full-shift staff fill a priority order based on which entrances are open today,
 * then fall back to round-robin when all targets are met.
 *
 * @param {object} options
 * @param {Array}  options.staffingRequirements
 * @param {object} options.staffByType
 * @param {Set}    options.assignedStaff        - mutated in place
 * @param {Array}  options.assignments           - mutated in place
 * @param {Map}    options.filledPositions        - mutated in place (not used for cap here but passed for consistency)
 * @param {string} options.zone
 * @param {string} options.dayCode
 * @param {object} options.skillsData
 * @param {Function} options.hasSkillForUnit
 * @param {Function} options.getCategoryFromUnit
 * @param {Function} options.timeToMinutes
 * @param {Function} options.canonicalizeUnitName
 * @returns {{ assignedCount: number }}
 */
function assignOverflowStaffStep5({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  hasSkillForUnit,
  getCategoryFromUnit,
  timeToMinutes,
  canonicalizeUnitName
}) {
  let assigned = 0;

  console.log(`\n   📍 STEP 5: Assigning overflow staff to busy units (allow overstaffing)...`);

  // Separate short-shift (morning coverage for Lodge) from full-shift (APGS/Sweet Shop)
  const overflowStaff = [
    ...staffByType.seniorHostsFullShift.filter(s => !assignedStaff.has(s.name)),
    ...staffByType.regularHostsFullShift.filter(s => !assignedStaff.has(s.name)),
    ...staffByType.regularHostsShortShift.filter(s => !assignedStaff.has(s.name))
  ];

  console.log(`   Found ${overflowStaff.length} overflow retail staff to assign`);

  // ✅ Detect which entrances are open today (needed for dynamic overflow targets)
  const hasExplorer = staffingRequirements.some(r => r.unitName === 'Explorer Entrance');
  const hasSchools = staffingRequirements.some(r => r.unitName === 'Schools Entrance');
  const hasLodge = staffingRequirements.some(r => r.unitName === 'Lodge Entrance');

  console.log(`   🚪 Entrances open: ${hasLodge ? 'Lodge' : ''} ${hasExplorer ? 'Explorer' : ''} ${hasSchools ? 'Schools' : ''}`);

  // ✅ MINIMUM OVERFLOW TARGETS (dynamic based on which entrances are open)
  // NOTE: Lodge Entrance gets ALL "Home @1" staff first (unlimited), then other units get overflow
  let UNIT_OVERFLOW_TARGETS;

  if (hasExplorer && hasSchools) {
    // Both Explorer and Schools open (e.g., Day Code G)
    UNIT_OVERFLOW_TARGETS = {
      'Explorer Entrance': 3,          // Priority entrance, reduced to avoid over-concentration
      'Lodge Entrance': 3,             // Secondary entrance (baseline + 3 overflow = 4-5 total)
      'Schools Entrance': 2,           // Additional Schools overflow (baseline varies + 2 = 5-6 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventure Point Gift Shop': 3,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 2,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else if (hasExplorer) {
    // Explorer open, no Schools (Day Codes E, F, H, I)
    UNIT_OVERFLOW_TARGETS = {
      'Explorer Entrance': 3,          // Priority entrance, reduced to avoid over-concentration
      'Lodge Entrance': 2,             // Secondary (baseline 2 + 2 overflow = 3-4 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventure Point Gift Shop': 3,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 2,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else if (hasSchools) {
    // Schools open, no Explorer (Day Codes B, C, D)
    UNIT_OVERFLOW_TARGETS = {
      'Lodge Entrance': 3,             // Priority entrance, reduced to avoid over-concentration
      'Schools Entrance': 2,           // Additional Schools overflow (baseline 4 + 2 = 5-6 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventure Point Gift Shop': 3,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 2,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else {
    // Lodge only (Day Code A, K-N - quiet days)
    UNIT_OVERFLOW_TARGETS = {
      'Lodge Entrance': 1,             // Quiet day - minimal overflow (baseline 2 + 1 = 2-3 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventure Point Gift Shop': 3,
      'Sweet Shop': 2,
      'Explorer Supplies': 1,
      'Sealife': 1,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  }

  // Track overflow count per unit for balanced distribution
  const overflowCount = {};

  // ✅ PRIORITY SYSTEM: Detect which entrances are open, prioritize accordingly
  // Explorer Days (E-I): Explorer Entrance takes priority (busier)
  // Schools Days (B-D): Lodge + Schools Entrance take priority
  // Lodge Only (A, K-N): Lodge priority
  const BUSY_DAY_CODES = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  const isBusyDay = BUSY_DAY_CODES.includes(dayCode);

  // Define ideal priority order based on what's open (hasExplorer, hasSchools, hasLodge defined earlier in Step 5)
  let IDEAL_PRIORITY_ORDER;
  if (hasExplorer && hasSchools) {
    // Both Explorer and Schools (e.g., Day Code G)
    IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Schools Entrance', 'Adventure Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else if (hasExplorer) {
    // Explorer open, no Schools (Day Codes E, F, H, I)
    IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Adventure Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else if (hasSchools) {
    // Schools open, no Explorer (Day Codes B, C, D)
    IDEAL_PRIORITY_ORDER = ['Lodge Entrance', 'Schools Entrance', 'Adventure Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else {
    // Lodge only (Day Code A, K-N - quiet days)
    IDEAL_PRIORITY_ORDER = ['Adventure Point Gift Shop', 'Sweet Shop', 'Lodge Entrance', 'Sealife', 'Ben & Jerry\'s', 'Lorikeets'];
  }

  // ✅ FIX: Filter to only units that actually have requirements for this day code
  const availableUnits = staffingRequirements
    .filter(r =>
      r.position.includes('Host') &&
      !r.position.includes('Senior Host') &&
      !r.position.includes('Break Cover') &&
      isRetailLikeUnit(r.unitName)
    )
    .map(r => r.unitName);

  // Move Freestyle & Vending units to the end of the priority order
  const freestyleUnits = availableUnits.filter(unit => /freestyle/i.test(unit));
  const shopUnits = availableUnits.filter(unit => !/freestyle/i.test(unit));
  const PRIORITY_ORDER = IDEAL_PRIORITY_ORDER.filter(unit => shopUnits.includes(unit)).concat(
    shopUnits.filter(unit => !IDEAL_PRIORITY_ORDER.includes(unit))
  ).concat(freestyleUnits);

  const hostDemandByUnit = {};
  for (const req of staffingRequirements) {
    if (!availableUnits.includes(req.unitName)) continue;
    if (!req.position.includes('Host')) continue;
    if (req.position.includes('Senior Host')) continue;
    if (req.position.includes('Break Cover')) continue;

    const required = Number(req.staffNeeded) || 1;
    hostDemandByUnit[req.unitName] = (hostDemandByUnit[req.unitName] || 0) + Math.max(1, required);
  }

  const totalAssignedByUnit = {};
  for (const assignment of assignments) {
    if (!availableUnits.includes(assignment.unit)) continue;
    if (assignment.isBreak || assignment.staff === 'UNFILLED') continue;
    totalAssignedByUnit[assignment.unit] = (totalAssignedByUnit[assignment.unit] || 0) + 1;
  }

  const AFTERNOON_FLOOR_MINUTE = timeToMinutes('14:00');
  const afternoonMinimumByUnit = {
    'Explorer Supplies': hasExplorer ? 2 : 1
  };

  const countCoverageAtMinute = (unitName, minuteMark) => (
    assignments.filter((assignment) =>
      assignment.unit === unitName &&
      assignment.staff !== 'UNFILLED' &&
      !assignment.isBreak &&
      timeToMinutes(assignment.startTime) <= minuteMark &&
      timeToMinutes(assignment.endTime) > minuteMark
    ).length
  );

  const getOpeningMinuteForUnit = (unitName) => (
    unitName.includes("Ben & Jerry's") ? timeToMinutes('12:00') : timeToMinutes('10:00')
  );

  const hasOpeningCoverage = (unitName, openingMinute) => (
    assignments.some((assignment) =>
      assignment.unit === unitName &&
      !assignment.isBreak &&
      assignment.staff !== 'UNFILLED' &&
      timeToMinutes(assignment.startTime) <= openingMinute &&
      timeToMinutes(assignment.endTime) > openingMinute
    )
  );

  const canStaffWorkUnit = (staffName, unitName) => {
    const skillGatedUnits = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk"]);
    if (!skillGatedUnits.has(unitName)) return true;
    return hasSkillForUnit(staffName, unitName, skillsData);
  };

  const getPriorityScore = (unitName) => {
    const index = PRIORITY_ORDER.indexOf(unitName);
    if (index === -1) return 0;
    return (PRIORITY_ORDER.length - index) * 20;
  };

  const getPhase1UnitScore = (unitName, staffStartMinute, staffEndMinute) => {
    const openingMinute = getOpeningMinuteForUnit(unitName);
    if (staffEndMinute <= openingMinute) return Number.NEGATIVE_INFINITY;

    const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
    const currentOverflow = overflowCount[unitName] || 0;
    if (currentOverflow >= unitCap) return Number.NEGATIVE_INFINITY;

    const demand = hostDemandByUnit[unitName] || 1;
    const assignedNow = totalAssignedByUnit[unitName] || 0;
    const demandGap = Math.max(0, demand - assignedNow);

    let openingUrgency = 0;
    if (staffStartMinute <= openingMinute && !hasOpeningCoverage(unitName, openingMinute)) {
      openingUrgency = 120;
    }

    const capHeadroom = ((unitCap - currentOverflow) / Math.max(1, unitCap)) * 25;
    const totalTarget = demand + unitCap;
    const coverageGap = Math.max(0, totalTarget - assignedNow) * 8;
    const afternoonMin = afternoonMinimumByUnit[unitName] || 0;
    const afternoonCoverage = countCoverageAtMinute(unitName, AFTERNOON_FLOOR_MINUTE);
    const coversAfternoonFloor = staffStartMinute <= AFTERNOON_FLOOR_MINUTE && staffEndMinute > AFTERNOON_FLOOR_MINUTE;
    const afternoonShortfall = Math.max(0, afternoonMin - afternoonCoverage);
    const afternoonFloorUrgency = coversAfternoonFloor ? afternoonShortfall * 500 : 0;

    return getPriorityScore(unitName) + (demandGap * 30) + capHeadroom + coverageGap + openingUrgency + afternoonFloorUrgency;
  };

  const getPhase2UnitScore = (unitName, staffEndMinute) => {
    const openingMinute = getOpeningMinuteForUnit(unitName);
    if (staffEndMinute <= openingMinute) return Number.NEGATIVE_INFINITY;

    const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
    const currentOverflow = overflowCount[unitName] || 0;
    const overflowRatio = currentOverflow / Math.max(1, unitCap);

    const demand = hostDemandByUnit[unitName] || 1;
    const assignedNow = totalAssignedByUnit[unitName] || 0;
    const demandGap = Math.max(0, demand - assignedNow);
    const afternoonMin = afternoonMinimumByUnit[unitName] || 0;
    const afternoonCoverage = countCoverageAtMinute(unitName, AFTERNOON_FLOOR_MINUTE);
    const afternoonShortfall = Math.max(0, afternoonMin - afternoonCoverage);
    const afternoonFloorUrgency = staffEndMinute > AFTERNOON_FLOOR_MINUTE ? afternoonShortfall * 500 : 0;

    return ((1 - overflowRatio) * 100) + (demandGap * 35) + getPriorityScore(unitName) + afternoonFloorUrgency;
  };

  // Initialize overflow count for all available units
  for (const unit of availableUnits) {
    overflowCount[unit] = 0;
  }

  console.log(`   📊 Day Code ${dayCode} = ${isBusyDay ? 'BUSY' : 'QUIET'} → Priority: ${PRIORITY_ORDER.slice(0, 3).join(', ')}...`);
  console.log(`   📋 Available units: ${availableUnits.join(', ')}`);


  for (const staff of overflowStaff) {
    if (assignedStaff.has(staff.name)) continue;

    let targetUnit = null;
    let positionLabel = 'Host (Overflow)';

    // ✅ SHORT-SHIFT STAFF (Home @1 - finish ≤14:00) → ALWAYS go to Lodge Entrance
    const endHour = parseInt(staff.endTime.split(':')[0]);
    if (endHour <= 14) {
      // ALL short-shift staff go to Lodge (no cap for Home @1)
      if (availableUnits.includes('Lodge Entrance')) {
        targetUnit = 'Lodge Entrance';
        positionLabel = 'Host (Morning)';
        console.log(`   🏠 ${staff.name} (Home @${endHour - 12}): Short shift → Lodge morning coverage (ALWAYS)`);
      } else {
        console.log(`   ⚠️  ${staff.name}: Short shift but Lodge Entrance not available, trying fallback...`);
      }
    }

    // If no target yet (either full-shift or Lodge not available/at cap for short-shift)
    if (!targetUnit) {
      const staffStartMinute = timeToMinutes(staff.startTime);
      const staffEndMinute = timeToMinutes(staff.endTime);

      // Enforce: Do not assign to Freestyle & Vending until all shop units are fully staffed
      const allShopUnitsFilled = shopUnits.every(unit => {
        const demand = hostDemandByUnit[unit] || 1;
        const assignedNow = totalAssignedByUnit[unit] || 0;
        return assignedNow >= demand;
      });

      let bestPhase1Score = Number.NEGATIVE_INFINITY;
      for (const unitName of PRIORITY_ORDER) {
        // If this is a Freestyle unit and not all shop units are filled, skip
        if (/freestyle/i.test(unitName) && !allShopUnitsFilled) continue;
        if (!canStaffWorkUnit(staff.name, unitName)) continue;
        const score = getPhase1UnitScore(unitName, staffStartMinute, staffEndMinute);
        if (score > bestPhase1Score) {
          bestPhase1Score = score;
          targetUnit = unitName;
        }
      }

      // ✅ If all priority units at cap/ineligible, try all available units by fair score
      if (!targetUnit) {
        let bestPhase2Score = Number.NEGATIVE_INFINITY;
        for (const unitName of availableUnits) {
          // If this is a Freestyle unit and not all shop units are filled, skip
          if (/freestyle/i.test(unitName) && !allShopUnitsFilled) continue;
          if (!canStaffWorkUnit(staff.name, unitName)) continue;
          const score = getPhase2UnitScore(unitName, staffEndMinute);
          if (score > bestPhase2Score) {
            bestPhase2Score = score;
            targetUnit = unitName;
          }
        }

        if (targetUnit) {
          console.log(`   📌 ${staff.name}: Priority caps reached/ineligible, fair fallback → ${targetUnit}`);
        }
      }

      // ✅ PHASE 2 FALLBACK: If ALL units hit targets, distribute remaining staff round-robin (unlimited)
      // This ensures NO staff are left unassigned
      if (!targetUnit) {
        // Find the unit with the lowest overflow count (round-robin distribution)
        let minCount = Infinity;
        for (const unitName of PRIORITY_ORDER) {
          // If this is a Freestyle unit and not all shop units are filled, skip
          if (/freestyle/i.test(unitName) && !allShopUnitsFilled) continue;
          if (overflowCount[unitName] < minCount) {
            minCount = overflowCount[unitName];
            targetUnit = unitName;
          }
        }

        // If somehow still no target (shouldn't happen), use first available unit
        if (!targetUnit && availableUnits.length > 0) {
          targetUnit = availableUnits[0];
        }

        if (targetUnit) {
          const target = UNIT_OVERFLOW_TARGETS[targetUnit] || 2;
          console.log(`   📌 ${staff.name}: All targets met, round-robin distribution → ${targetUnit} (${overflowCount[targetUnit] + 1} overflow, target was ${target})`);
        }
      }
    }

    if (!targetUnit) {
      console.log(`   ⚠️  ${staff.name}: ERROR - Could not find any available unit (this should not happen)`);
      continue;
    }

    const req = staffingRequirements.find(r =>
      r.unitName === targetUnit &&
      r.position.includes('Host') &&
      !r.position.includes('Senior Host')
    );

    if (req) {
      assignments.push({
        unit: req.unitName,
        position: req.position,
        positionType: positionLabel,
        staff: staff.name,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: `${req.unitName}-Host-${endHour <= 14 ? 'Morning' : 'Overflow'}`,
        startTime: staff.startTime,
        endTime: staff.endTime,
        breakMinutes: endHour <= 14 ? 0 : (staff.scheduledBreakMinutes || 0),  // No breaks for short shifts
        isBreak: false,
        category: getCategoryFromUnit(req.unitName)
      });

      assignedStaff.add(staff.name);
      overflowCount[targetUnit]++;
      totalAssignedByUnit[targetUnit] = (totalAssignedByUnit[targetUnit] || 0) + 1;
      const unitCap = UNIT_OVERFLOW_TARGETS[targetUnit] || 2;
      const label = endHour <= 14 ? 'MORNING' : `OVERFLOW #${overflowCount[targetUnit]}/${unitCap}`;
      console.log(`   ✅ ${staff.name} → ${req.unitName} (${label}, ${staff.startTime}-${staff.endTime})`);
      assigned++;
    } else {
      console.log(`   ⚠️  ${staff.name}: Could not find requirement for ${targetUnit}`);
    }
  }

  // Build summary dynamically based on what units exist
  const summaryParts = [];
  let targetsExceeded = false;
  for (const unit of PRIORITY_ORDER) {
    const shortName = unit.replace(' Entrance', '').replace('Adventure Point Gift Shop', 'APGS').replace('Sweet Shop', 'Sweet').replace('Ben & Jerry\'s', 'BJ').replace('Explorer Supplies', 'Exp Supp').replace('Ben & Jerry\'s Kiosk', 'BJ Kiosk');
    const target = UNIT_OVERFLOW_TARGETS[unit] || 2;
    const actual = overflowCount[unit] || 0;

    if (actual > target) {
      summaryParts.push(`${shortName}=${actual}/${target}⬆️`);
      targetsExceeded = true;
    } else {
      summaryParts.push(`${shortName}=${actual}/${target}`);
    }
  }
  console.log(`\n   📊 Overflow distribution: ${summaryParts.join(', ')}`);
  if (targetsExceeded) {
    console.log(`   📌 Note: ⬆️ indicates target exceeded (all staff assigned, no one left behind)`);
  }

  return { assignedCount: assigned };
}

module.exports = { assignOverflowStaffStep5 };
