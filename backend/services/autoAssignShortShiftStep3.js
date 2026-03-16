function assignShortShiftHostsStep3(options) {
  const {
    staffingRequirements,
    staffByType,
    assignedStaff,
    assignments,
    filledPositions,
    zone,
    dayCode,
    log = console.log
  } = options;

  log('\n   📍 STEP 3: Assigning short-shift Hosts (morning coverage)...');

  const EXPLORER_BASELINE_DAYS = new Set(['E', 'F', 'G', 'H', 'I']);
  const shortShiftTargetUnit =
    EXPLORER_BASELINE_DAYS.has(dayCode) &&
    staffingRequirements.some(
      (r) => r.unitName === 'Explorer Entrance' && r.position.includes('Host') && !r.position.includes('Senior Host')
    )
      ? 'Explorer Entrance'
      : 'Lodge Entrance';

  const SHORT_SHIFT_NEEDED = 2;
  let assignedCount = 0;

  for (let i = 0; i < SHORT_SHIFT_NEEDED; i++) {
    const req = staffingRequirements.find(
      (r) =>
        r.unitName === shortShiftTargetUnit &&
        r.position.includes('Host') &&
        !r.position.includes('Senior Host')
    );

    if (!req) {
      continue;
    }

    const availableShort = staffByType.regularHostsShortShift.find((staff) => !assignedStaff.has(staff.name));

    if (availableShort) {
      assignments.push({
        unit: req.unitName,
        position: req.position,
        positionType: 'Host (Short Shift)',
        staff: availableShort.name,
        zone,
        dayCode,
        trainingMatch: `${req.unitName}-Host`,
        startTime: availableShort.startTime,
        endTime: availableShort.endTime,
        breakMinutes: 0,
        isBreak: false,
        category: 'Admissions'
      });

      assignedStaff.add(availableShort.name);
      const unitPositionKey = `${req.unitName}-${req.position}`;
      filledPositions.set(unitPositionKey, (filledPositions.get(unitPositionKey) || 0) + 1);
      assignedCount += 1;
      log(`   ✅ ${availableShort.name} → ${req.unitName} (Host SHORT, ${availableShort.startTime}-${availableShort.endTime})`);
    }
  }

  return { assignedCount };
}

module.exports = {
  assignShortShiftHostsStep3
};
