const { isRetailLikeUnit } = require('../../utils/unitHelpers');

function prepareFullShiftAssignmentsAndReserve(options) {
  const {
    staffingRequirements,
    canonicalizeUnitName,
    filledPositions,
    staffByType,
    assignedStaff,
    hasSkillForUnit,
    skillsData,
    assignments,
    zone,
    dayCode,
    getCategoryFromUnit,
    log = console.log
  } = options;

  log('\n   STEP 2: Assigning full-shift Hosts for all-day coverage...');

  const fullShiftAssignments = [];
  const retailAdmissionsUnits = staffingRequirements.filter((req) =>
    isRetailLikeUnit(req.unitName) &&
    req.position.includes('Host') &&
    !req.position.includes('Senior Host') &&
    !req.position.includes('Break Cover')
  );

  for (const req of retailAdmissionsUnits) {
    const unitPositionKey = `${req.unitName}-${req.position}`;
    const currentFill = filledPositions.get(unitPositionKey) || 0;
    const needed = req.staffNeeded - currentFill;
    if (needed > 0) {
      fullShiftAssignments.push({ unit: req.unitName, count: needed, req, unitPositionKey });
    }
  }


  // Shop units to prioritize before Freestyle & Vending
  const shopUnits = [
    'Adventures Point Gift Shop', 'Dragon Treats', 'Sealife', 'Sweet Shop', "Ben & Jerry's", "Ben & Jerry's Kiosk",
    'Croc Drop Shop', 'Paw Patrol Shop', 'Zufari Barrow', 'Lorikeets', 'Gruffalo Shop', 'Gruffalo Gift Shop', 'Jumanji Shop', 'Shipwreck Kiosk', 'Tiger Kiosk'
  ];
  const freestyleUnits = ['Freestyle & Vending', 'Freestyle and Vending', 'Freestyle'];

  // Assign priorities: shops first, then freestyle units
  const step2UnitPriority = {};
  let prio = 10;
  for (const unit of shopUnits) {
    step2UnitPriority[unit] = prio++;
  }
  for (const unit of freestyleUnits) {
    step2UnitPriority[unit] = 100 + prio++;
  }

  fullShiftAssignments.sort((a, b) => {
    const priorityA = step2UnitPriority[a.unit] || 999;
    const priorityB = step2UnitPriority[b.unit] || 999;
    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }
    return a.unit.localeCompare(b.unit);
  });

  const skillGatedStep2 = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sealife', 'Sweet Shop']);

  const retailReserveUnits = ['Sealife', 'Sweet Shop'];
  let assignedCount = 0;

  for (const reserveUnit of retailReserveUnits) {
    const reserveReqs = staffingRequirements.filter((req) =>
      req.unitName === reserveUnit &&
      req.position.includes('Host') &&
      !req.position.includes('Senior Host') &&
      !req.position.includes('Break Cover')
    );

    if (reserveReqs.length === 0) {
      continue;
    }

    const neededTotal = reserveReqs.reduce((sum, req) => {
      const key = `${req.unitName}-${req.position}`;
      const remaining = req.staffNeeded - (filledPositions.get(key) || 0);
      return sum + Math.max(0, remaining);
    }, 0);

    if (neededTotal <= 0) {
      continue;
    }

    const trainedAvailable = staffByType.regularHostsFullShift.filter(
      (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, reserveUnit, skillsData)
    );

    log(`   Reserve pre-pass for ${reserveUnit}: need ${neededTotal}, trained available ${trainedAvailable.length}`);

    for (const req of reserveReqs) {
      const key = `${req.unitName}-${req.position}`;
      while ((filledPositions.get(key) || 0) < req.staffNeeded) {
        const reserveHost = trainedAvailable.find((staff) => !assignedStaff.has(staff.name));
        if (!reserveHost) {
          break;
        }

        assignments.push({
          unit: req.unitName,
          position: req.position,
          positionType: 'Host (Reserved Skill Gate)',
          staff: reserveHost.name,
          zone,
          dayCode,
          trainingMatch: `${req.unitName}-Host`,
          startTime: reserveHost.startTime,
          endTime: reserveHost.endTime,
          breakMinutes: reserveHost.scheduledBreakMinutes || 0,
          isBreak: false,
          category: getCategoryFromUnit(req.unitName)
        });

        assignedStaff.add(reserveHost.name);
        filledPositions.set(key, (filledPositions.get(key) || 0) + 1);
        assignedCount += 1;
        log(`   [RESERVE] ${reserveHost.name} -> ${req.unitName} (${reserveHost.startTime}-${reserveHost.endTime})`);
      }
    }
  }

  return {
    fullShiftAssignments,
    skillGatedStep2,
    assignedCount
  };
}

module.exports = {
  prepareFullShiftAssignmentsAndReserve
};
