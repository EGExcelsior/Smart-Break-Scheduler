
function assignFullShiftHostsStep2(options) {
  const {
    fullShiftAssignments,
    filledPositions,
    skillGatedStep2,
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

  let assignedCount = 0;

  // Identify entrance units that require Senior Hosts
  const ENTRANCE_UNITS = ['Lodge Entrance', 'Explorer Entrance', 'Schools Entrance', 'Azteca Entrance'];
  const entranceSeniorHostReqs = fullShiftAssignments.filter(a =>
    ENTRANCE_UNITS.includes(a.req.unitName) && a.req.position && a.req.position.includes('Senior Host')
  );

  // Assign Senior Hosts to entrances first
  for (const assignment of entranceSeniorHostReqs) {
    while ((filledPositions.get(assignment.unitPositionKey) || 0) < assignment.req.staffNeeded) {
      const availableSenior = staffByType.seniorHostsFullShift && staffByType.seniorHostsFullShift.find(
        (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, assignment.req.unitName, skillsData)
      );
      if (availableSenior) {
        assignments.push({
          unit: assignment.req.unitName,
          position: assignment.req.position,
          positionType: 'Senior Host (Full Shift)',
          staff: availableSenior.name,
          zone,
          dayCode,
          trainingMatch: `${assignment.req.unitName}-Senior Host`,
          startTime: availableSenior.startTime,
          endTime: availableSenior.endTime,
          breakMinutes: availableSenior.scheduledBreakMinutes || 0,
          isBreak: false,
          category: getCategoryFromUnit(assignment.req.unitName)
        });
        assignedStaff.add(availableSenior.name);
        filledPositions.set(assignment.unitPositionKey, (filledPositions.get(assignment.unitPositionKey) || 0) + 1);
        assignedCount += 1;
        log(`   PRIORITY ${availableSenior.name} -> ${assignment.req.unitName} (Senior Host, ${availableSenior.startTime}-${availableSenior.endTime})`);
      } else {
        log(`   WARNING No available Senior Host for ${assignment.req.unitName}`);
        break;
      }
    }
  }

  // Now assign remaining full-shift hosts (including Senior Hosts to retail only if entrances are covered)
  for (const assignment of fullShiftAssignments) {
    // Skip entrance Senior Host reqs (already handled)
    if (entranceSeniorHostReqs.includes(assignment)) continue;

    // Cap Sweet Shop assignments
    if (assignment.req.unitName === 'Sweet Shop') {
      const sweetShopCap = 3;
      if ((filledPositions.get(assignment.unitPositionKey) || 0) >= sweetShopCap) {
        log(`   CAP Sweet Shop: already assigned ${sweetShopCap}`);
        continue;
      }
    }

    while ((filledPositions.get(assignment.unitPositionKey) || 0) < assignment.req.staffNeeded) {
      const freestyleUnits = ['Freestyle & Vending', 'Freestyle and Vending', 'Freestyle'];
      let availableHost;
      if (skillGatedStep2.has(assignment.req.unitName) || freestyleUnits.includes(assignment.req.unitName)) {
        availableHost = staffByType.regularHostsFullShift.find(
          (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, assignment.req.unitName, skillsData)
        );
      } else {
        availableHost = staffByType.regularHostsFullShift.find((staff) => !assignedStaff.has(staff.name));
      }

      // Only assign Senior Hosts to retail if all entrance Senior Host reqs are filled
      if (
        assignment.req.position && assignment.req.position.includes('Senior Host') &&
        !ENTRANCE_UNITS.includes(assignment.req.unitName)
      ) {
        const unfilledEntrance = entranceSeniorHostReqs.some(e => (filledPositions.get(e.unitPositionKey) || 0) < e.req.staffNeeded);
        if (unfilledEntrance) {
          log(`   SKIP ${assignment.req.unitName}: Senior Host needed at entrance first`);
          break;
        }
      }

      // Sweet Shop fallback preserves existing behavior if trained staff are exhausted.
      if (!availableHost && assignment.req.unitName === 'Sweet Shop') {
        availableHost = staffByType.regularHostsFullShift.find((staff) => !assignedStaff.has(staff.name));
        if (availableHost) {
          log(`   WARNING ${assignment.req.unitName}: no trained host available, using fallback ${availableHost.name} for coverage`);
        }
      }

      // Only assign to Freestyle if all shops are fully covered
      if (freestyleUnits.includes(assignment.req.unitName)) {
        const shopUnits = ['Paw Patrol Shop', 'Croc Drop Shop', 'Dragon Treats'];
        const allShopsCovered = shopUnits.every(shop => {
          const shopKey = `${shop}-Host`;
          const req = fullShiftAssignments.find(a => a.unit === shop);
          if (!req) return true;
          const filled = filledPositions.get(shopKey) || 0;
          return filled >= req.req.staffNeeded;
        });
        if (!allShopsCovered) {
          log(`   SKIP ${assignment.req.unitName}: Not all shops are covered, skipping Freestyle assignment.`);
          break;
        }
      }
      if (availableHost) {
        assignments.push({
          unit: assignment.req.unitName,
          position: assignment.req.position,
          positionType: 'Host (Full Shift)',
          staff: availableHost.name,
          zone,
          dayCode,
          trainingMatch: `${assignment.req.unitName}-Host`,
          startTime: availableHost.startTime,
          endTime: availableHost.endTime,
          breakMinutes: availableHost.scheduledBreakMinutes || 0,
          isBreak: false,
          category: getCategoryFromUnit(assignment.req.unitName)
        });
        assignedStaff.add(availableHost.name);
        filledPositions.set(assignment.unitPositionKey, (filledPositions.get(assignment.unitPositionKey) || 0) + 1);
        assignedCount += 1;
        log(`   OK ${availableHost.name} -> ${assignment.req.unitName} (Host, ${availableHost.startTime}-${availableHost.endTime})`);
      } else {
        log(`   WARNING No available full-shift host for ${assignment.req.unitName}`);
        break;
      }
    }
  }

  return { assignedCount };
}

module.exports = {
  assignFullShiftHostsStep2
};
