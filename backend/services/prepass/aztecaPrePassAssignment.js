function applyAztecaPrePass(options) {
  const {
    staffingRequirements,
    staffByType,
    assignedStaff,
    assignments,
    filledPositions,
    dayCode,
    zone,
    getCategoryFromUnit,
    log = console.log
  } = options;

  const aztecaReq = staffingRequirements.find((r) => r.unitName === 'Azteca Entrance');
  const otherEntrancesOpen = staffingRequirements.some((r) =>
    r.unitName !== 'Azteca Entrance' && r.unitName.includes('Entrance')
  );

  if (!aztecaReq || !otherEntrancesOpen) {
    return { assignedCount: 0, aztecaFilled: 0 };
  }

  const AZTECA_LEAVE_TIME = '10:00';
  const AZTECA_LODGE_TIME = '11:00';
  const AZTECA_STAFF_COUNT = 2;

  const aztecaCandidates = [
    ...staffByType.regularHostsFullShift,
    ...staffByType.seniorHostsFullShift
  ].filter((staff) => !assignedStaff.has(staff.name) && staff.startTime === '08:30');

  const EXPLORER_BASELINE_DAYS = new Set(['E', 'F', 'G', 'H', 'I']);
  const hasExplorerEntrance = staffingRequirements.some((r) => r.unitName === 'Explorer Entrance');
  const hasLodgeEntrance = staffingRequirements.some((r) => r.unitName === 'Lodge Entrance');
  const postAztecaUnit = (EXPLORER_BASELINE_DAYS.has(dayCode) && hasExplorerEntrance)
    ? 'Explorer Entrance'
    : (hasLodgeEntrance ? 'Lodge Entrance' : 'Adventure Point Gift Shop');

  log(`\n   🚗 Azteca pre-pass: assigning 2 early starters (08:30-${AZTECA_LEAVE_TIME}), then ${postAztecaUnit} (${AZTECA_LEAVE_TIME}-${AZTECA_LODGE_TIME}), break at 11:00`);

  let aztecaFilled = 0;
  let assignedCount = 0;

  for (const host of aztecaCandidates) {
    if (aztecaFilled >= AZTECA_STAFF_COUNT) {
      break;
    }

    assignments.push({
      unit: 'Azteca Entrance',
      position: aztecaReq.position,
      positionType: 'Host (Azteca Morning)',
      staff: host.name,
      zone,
      dayCode,
      trainingMatch: 'Azteca Entrance-Host',
      startTime: host.startTime,
      endTime: AZTECA_LEAVE_TIME,
      breakMinutes: 0,
      isBreak: false,
      category: 'Admissions'
    });

    assignments.push({
      unit: postAztecaUnit,
      position: 'Admissions Host',
      positionType: 'Host (Post-Azteca)',
      staff: host.name,
      zone,
      dayCode,
      trainingMatch: `${postAztecaUnit}-Host`,
      startTime: AZTECA_LEAVE_TIME,
      endTime: AZTECA_LODGE_TIME,
      breakMinutes: 0,
      isBreak: false,
      category: getCategoryFromUnit(postAztecaUnit)
    });

    assignments.push({
      unit: postAztecaUnit,
      position: 'Admissions Host',
      positionType: 'Host (Post-Break)',
      staff: host.name,
      zone,
      dayCode,
      trainingMatch: `${postAztecaUnit}-Host`,
      startTime: AZTECA_LODGE_TIME,
      endTime: host.endTime,
      breakMinutes: host.scheduledBreakMinutes || 0,
      isBreak: false,
      category: getCategoryFromUnit(postAztecaUnit)
    });

    assignedStaff.add(host.name);
    const aztecaKey = `Azteca Entrance-${aztecaReq.position}`;
    filledPositions.set(aztecaKey, (filledPositions.get(aztecaKey) || 0) + 1);

    aztecaFilled += 1;
    assignedCount += 1;

    log(`   🚗 ${host.name} → Azteca (08:30-${AZTECA_LEAVE_TIME}) → ${postAztecaUnit} (${AZTECA_LEAVE_TIME}-${AZTECA_LODGE_TIME}) → break 11:00 → free`);
  }

  if (aztecaFilled < AZTECA_STAFF_COUNT) {
    log(`   ⚠️  Azteca pre-pass: only found ${aztecaFilled}/${AZTECA_STAFF_COUNT} 08:30 starters`);
  }

  return { assignedCount, aztecaFilled };
}

module.exports = {
  applyAztecaPrePass
};
