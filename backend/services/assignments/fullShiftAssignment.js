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
      let availableHost = skillGatedStep2.has(assignment.req.unitName)
        ? staffByType.regularHostsFullShift.find(
          (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, assignment.req.unitName, skillsData)
        )
        : staffByType.regularHostsFullShift.find((staff) => !assignedStaff.has(staff.name));

      // Sweet Shop fallback preserves existing behavior if trained staff are exhausted.
      if (!availableHost && assignment.req.unitName === 'Sweet Shop') {
        availableHost = staffByType.regularHostsFullShift.find((staff) => !assignedStaff.has(staff.name));
        if (availableHost) {
          log(`   WARNING ${assignment.req.unitName}: no trained host available, using fallback ${availableHost.name} for coverage`);
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
