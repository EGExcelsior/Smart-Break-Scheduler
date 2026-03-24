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

  for (const assignment of fullShiftAssignments) {
    // Check live fill count against requirement so reserve pre-pass assignments are accounted for.
    while ((filledPositions.get(assignment.unitPositionKey) || 0) < assignment.req.staffNeeded) {
      // Enforce skill-gate for Freestyle as well as B&J's, Sealife, Sweet Shop
      const freestyleUnits = ['Freestyle & Vending', 'Freestyle and Vending', 'Freestyle'];
      let availableHost;
      if (skillGatedStep2.has(assignment.req.unitName) || freestyleUnits.includes(assignment.req.unitName)) {
        availableHost = staffByType.regularHostsFullShift.find(
          (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, assignment.req.unitName, skillsData)
        );
      } else {
        availableHost = staffByType.regularHostsFullShift.find((staff) => !assignedStaff.has(staff.name));
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
        // Check if any shop in priority list is not fully covered
        const shopUnits = ['Paw Patrol Shop', 'Croc Drop Shop', 'Dragon Treats'];
        const allShopsCovered = shopUnits.every(shop => {
          const shopKey = `${shop}-Host`;
          const req = fullShiftAssignments.find(a => a.unit === shop);
          if (!req) return true; // If not required, treat as covered
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
