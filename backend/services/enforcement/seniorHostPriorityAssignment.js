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

  let priorityUnitsForSeniorHost = [];
  if (zone && zone.toLowerCase().includes('odyssey')) {
    // Odyssey Senior: Paw Patrol Shop 1 -> Freestyle 1
    priorityUnitsForSeniorHost = [
      'Paw Patrol Shop',
      'Freestyle'
    ];
  } else if (zone && zone.toLowerCase().includes('phantom')) {
    // Phantom Senior: Gruffalo Shop 1 -> Jumanji Shop 1
    priorityUnitsForSeniorHost = [
      'Gruffalo Shop',
      'Jumanji Shop'
    ];
  } else {
    priorityUnitsForSeniorHost = [
      ...new Set([
        ...admissionsUnits,
        'Adventure Point Gift Shop',
        'Sweet Shop'
      ])
    ];
  }

  log(`   Priority units for Senior Hosts: ${priorityUnitsForSeniorHost.join(', ')}`);

  let assignedCount = 0;

  // Assign all available senior hosts to priority units in order
  const unassignedSeniors = staffByType.seniorHostsFullShift.filter((staff) => !assignedStaff.has(staff.name));
  let seniorIndex = 0;
  for (const unitName of priorityUnitsForSeniorHost) {
    const req = staffingRequirements.find((requirement) =>
      requirement.unitName === unitName && requirement.position.includes('Senior Host')
    );
    if (!req) continue;
    const unitPositionKey = `${req.unitName}-${req.position}`;
    let filled = filledPositions.get(unitPositionKey) || 0;
    while (filled < req.staffNeeded && seniorIndex < unassignedSeniors.length) {
      const availableSenior = unassignedSeniors[seniorIndex];
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
      filled++;
      filledPositions.set(unitPositionKey, filled);
      assignedCount += 1;
      log(`   ✅ ${availableSenior.name} → ${unitName} (Senior Host, ${availableSenior.startTime}-${availableSenior.endTime})`);
      seniorIndex++;
    }
  }

  return { assignedCount, priorityUnitsForSeniorHost };
}

module.exports = {
  applySeniorHostPriorityStep
};
