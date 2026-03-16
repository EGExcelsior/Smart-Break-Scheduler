function applySeniorHostPriorityStep(options) {
  const {
    staffingRequirements,
    staffByType,
    assignedStaff,
    assignments,
    filledPositions,
    zone,
    dayCode,
    getCategoryFromUnit,
    log = console.log
  } = options;

  log('\n   📍 STEP 1: Assigning Senior Hosts to priority units...');

  const admissionsUnits = staffingRequirements
    .filter((req) => req.unitName.includes('Entrance') && req.position.includes('Senior Host'))
    .map((req) => req.unitName);

  const priorityUnitsForSeniorHost = [
    ...new Set([
      ...admissionsUnits,
      'Adventures Point Gift Shop',
      'Sweet Shop'
    ])
  ];

  log(`   Priority units for Senior Hosts: ${priorityUnitsForSeniorHost.join(', ')}`);

  let assignedCount = 0;

  for (const unitName of priorityUnitsForSeniorHost) {
    const req = staffingRequirements.find((requirement) =>
      requirement.unitName === unitName && requirement.position.includes('Senior Host')
    );

    if (!req) {
      continue;
    }

    const unitPositionKey = `${req.unitName}-${req.position}`;
    if ((filledPositions.get(unitPositionKey) || 0) >= req.staffNeeded) {
      log(`   ✅ ${unitName}: Already has Senior Host`);
      continue;
    }

    const availableSenior = staffByType.seniorHostsFullShift.find(
      (staff) => !assignedStaff.has(staff.name)
    );

    if (availableSenior) {
      assignments.push({
        unit: req.unitName,
        position: req.position,
        positionType: 'Senior Host',
        staff: availableSenior.name,
        zone,
        dayCode,
        trainingMatch: `${req.unitName}-Senior Host`,
        startTime: availableSenior.startTime,
        endTime: availableSenior.endTime,
        breakMinutes: availableSenior.scheduledBreakMinutes || 0,
        isBreak: false,
        category: getCategoryFromUnit(req.unitName)
      });

      assignedStaff.add(availableSenior.name);
      filledPositions.set(unitPositionKey, (filledPositions.get(unitPositionKey) || 0) + 1);
      assignedCount += 1;
      log(`   ✅ ${availableSenior.name} → ${unitName} (Senior Host, ${availableSenior.startTime}-${availableSenior.endTime})`);
    }
  }

  return { assignedCount, priorityUnitsForSeniorHost };
}

module.exports = {
  applySeniorHostPriorityStep
};
