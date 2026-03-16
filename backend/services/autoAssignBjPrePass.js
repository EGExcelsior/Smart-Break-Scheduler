function applyBjPrePass(options) {
  const {
    staffingRequirements,
    staffByType,
    assignedStaff,
    assignments,
    zone,
    dayCode,
    skillsData,
    hasSkillForUnit,
    timeToMinutes,
    log = console.log
  } = options;

  const BJ_OPEN_PRE = '12:00';
  const BJ_MIN_GUARANTEE = 2;
  const bjBaseReq = staffingRequirements.find((req) => req.unitName === "Ben & Jerry's");

  if (!bjBaseReq) {
    return { assignedCount: 0, bjFilled: 0 };
  }

  const bjTrained = staffByType.regularHostsFullShift.filter(
    (staff) => !assignedStaff.has(staff.name) && hasSkillForUnit(staff.name, "Ben & Jerry's", skillsData)
  );

  log(`   🍦 B&J pre-pass: ${bjTrained.length} trained staff, guaranteeing ${BJ_MIN_GUARANTEE} from ${BJ_OPEN_PRE}`);

  let bjFilled = 0;
  let assignedCount = 0;

  for (const host of bjTrained) {
    if (bjFilled >= BJ_MIN_GUARANTEE) {
      break;
    }

    if (timeToMinutes(host.startTime) < timeToMinutes(BJ_OPEN_PRE)) {
      assignments.push({
        unit: 'Sweet Shop',
        position: 'Retail Host',
        positionType: 'Host (Morning Cover)',
        staff: host.name,
        zone,
        dayCode,
        trainingMatch: 'Sweet Shop-Host',
        startTime: host.startTime,
        endTime: BJ_OPEN_PRE,
        breakMinutes: 0,
        isBreak: false,
        category: 'Retail'
      });
      assignments.push({
        unit: "Ben & Jerry's",
        position: 'Retail Host',
        positionType: 'Host (B&J from open)',
        staff: host.name,
        zone,
        dayCode,
        trainingMatch: "Ben & Jerry's-Host",
        startTime: BJ_OPEN_PRE,
        endTime: host.endTime,
        breakMinutes: host.scheduledBreakMinutes || 0,
        isBreak: false,
        category: 'Retail'
      });
      log(`   🍦 [PRE] ${host.name} → Sweet Shop (${host.startTime}-${BJ_OPEN_PRE}) then B&J (${BJ_OPEN_PRE}-${host.endTime})`);
    } else {
      assignments.push({
        unit: "Ben & Jerry's",
        position: 'Retail Host',
        positionType: 'Host (B&J from open)',
        staff: host.name,
        zone,
        dayCode,
        trainingMatch: "Ben & Jerry's-Host",
        startTime: host.startTime,
        endTime: host.endTime,
        breakMinutes: host.scheduledBreakMinutes || 0,
        isBreak: false,
        category: 'Retail'
      });
      log(`   🍦 [PRE] ${host.name} → Ben & Jerry's (${host.startTime}-${host.endTime})`);
    }

    assignedStaff.add(host.name);
    assignedCount += 1;
    bjFilled += 1;
  }

  if (bjFilled < BJ_MIN_GUARANTEE) {
    log(`   ⚠️  B&J pre-pass: only ${bjFilled}/${BJ_MIN_GUARANTEE} trained staff found`);
  }

  return { assignedCount, bjFilled };
}

module.exports = {
  applyBjPrePass
};
