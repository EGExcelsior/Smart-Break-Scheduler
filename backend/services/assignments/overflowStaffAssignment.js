'use strict';

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
      'Explorer Entrance': 4,          // Priority entrance (baseline + 4 overflow = 5-6 total)
      'Lodge Entrance': 3,             // Secondary entrance (baseline + 3 overflow = 4-5 total)
      'Schools Entrance': 2,           // Additional Schools overflow (baseline varies + 2 = 5-6 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventures Point Gift Shop': 2,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 1,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else if (hasExplorer) {
    // Explorer open, no Schools (Day Codes E, F, H, I)
    UNIT_OVERFLOW_TARGETS = {
      'Explorer Entrance': 4,          // Priority entrance (baseline 2-3 + 4 overflow = 5-6 total)
      'Lodge Entrance': 2,             // Secondary (baseline 2 + 2 overflow = 3-4 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventures Point Gift Shop': 2,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 1,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else if (hasSchools) {
    // Schools open, no Explorer (Day Codes B, C, D)
    UNIT_OVERFLOW_TARGETS = {
      'Lodge Entrance': 4,             // Priority entrance (baseline 2 + 4 overflow = 5-6 total)
      'Schools Entrance': 2,           // Additional Schools overflow (baseline 4 + 2 = 5-6 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventures Point Gift Shop': 2,
      'Sweet Shop': 2,
      'Sealife': 1,
      'Explorer Supplies': 1,
      'Ben & Jerry\'s': 2,
      'Ben & Jerry\'s Kiosk': 1,
      'Lorikeets': 1
    };
  } else {
    // Lodge only (Day Code A, K-N - quiet days)
    UNIT_OVERFLOW_TARGETS = {
      'Lodge Entrance': 1,             // Quiet day - minimal overflow (baseline 2 + 1 = 2-3 total)
      // Azteca excluded — closes at 10:00, staffed by pre-pass only
      'Adventures Point Gift Shop': 2,
      'Sweet Shop': 2,
      'Sealife': 1,
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
    IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Schools Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else if (hasExplorer) {
    // Explorer open, no Schools (Day Codes E, F, H, I)
    IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else if (hasSchools) {
    // Schools open, no Explorer (Day Codes B, C, D)
    IDEAL_PRIORITY_ORDER = ['Lodge Entrance', 'Schools Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
  } else {
    // Lodge only (Day Code A, K-N - quiet days)
    IDEAL_PRIORITY_ORDER = ['Adventures Point Gift Shop', 'Sweet Shop', 'Lodge Entrance', 'Sealife', 'Ben & Jerry\'s', 'Lorikeets'];
  }

  // ✅ FIX: Filter to only units that actually have requirements for this day code
  const availableUnits = staffingRequirements
    .filter(r =>
      r.position.includes('Host') &&
      !r.position.includes('Senior Host') &&
      !r.position.includes('Break Cover') &&
      (r.unitName.includes('Entrance') || r.unitName.includes('Shop') || canonicalizeUnitName(r.unitName) === 'Sealife' || r.unitName.includes('Supplies') || r.unitName.includes('Jerry') || r.unitName.includes('Lorikeets'))
    )
    .map(r => r.unitName);

  const PRIORITY_ORDER = IDEAL_PRIORITY_ORDER.filter(unit => availableUnits.includes(unit));

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
      // ✅ Try priority units first, respecting unit-specific caps
      for (const unitName of PRIORITY_ORDER) {
        const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
        // ✅ Skill gate: B&J and B&J Kiosk require trained staff even in overflow
        const BJ_UNITS = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk"]);
        if (BJ_UNITS.has(unitName) && !hasSkillForUnit(staff.name, unitName, skillsData)) continue;
        if (overflowCount[unitName] < unitCap) {
          targetUnit = unitName;
          break;
        }
      }

      // ✅ If all priority units at cap, try ANY available unit that hasn't hit cap
      if (!targetUnit) {
        for (const unitName of availableUnits) {
          const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
          if (overflowCount[unitName] < unitCap) {
            targetUnit = unitName;
            console.log(`   📌 ${staff.name}: All priority units at cap, using fallback → ${unitName}`);
            break;
          }
        }
      }

      // ✅ PHASE 2 FALLBACK: If ALL units hit targets, distribute remaining staff round-robin (unlimited)
      // This ensures NO staff are left unassigned
      if (!targetUnit) {
        // Find the unit with the lowest overflow count (round-robin distribution)
        let minCount = Infinity;
        for (const unitName of PRIORITY_ORDER) {
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
    const shortName = unit.replace(' Entrance', '').replace('Adventures Point Gift Shop', 'APGS').replace('Sweet Shop', 'Sweet').replace('Ben & Jerry\'s', 'BJ').replace('Explorer Supplies', 'Exp Supp').replace('Ben & Jerry\'s Kiosk', 'BJ Kiosk');
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
