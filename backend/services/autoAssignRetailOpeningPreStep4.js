function enforceRetailOpeningCoverage(options) {
  const {
    staffingRequirements,
    assignments,
    staffByType,
    assignedStaff,
    filledPositions,
    zone,
    dayCode,
    skillsData,
    getCategoryFromUnit,
    hasSkillForUnit,
    timeToMinutes,
    log = console.log
  } = options;

  log('\n   🕙 PRE-STEP 4: Enforcing retail opening coverage...');

  const RETAIL_OPENING_DEFAULT = '10:00';
  const RETAIL_OPENING_BJ = '12:00';
  const RETAIL_OPENING_SKILL_GATED = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sweet Shop', 'Sealife']);

  const retailUnitsNeedingOpening = [
    ...new Set(
      staffingRequirements
        .filter(
          (req) =>
            getCategoryFromUnit(req.unitName) === 'Retail' &&
            req.position.includes('Host') &&
            !req.position.includes('Break Cover')
        )
        .map((req) => req.unitName)
    )
  ].filter((unitName) => unitName !== 'Retail Break Cover' && unitName !== 'Zonal Leads');

  let assignedCount = 0;

  for (const unitName of retailUnitsNeedingOpening) {
    const openingTime = unitName.includes("Ben & Jerry's") ? RETAIL_OPENING_BJ : RETAIL_OPENING_DEFAULT;
    const openingMinute = timeToMinutes(openingTime);

    const openingCoverage = assignments.filter(
      (a) =>
        a.unit === unitName &&
        !a.isBreak &&
        a.staff !== 'UNFILLED' &&
        timeToMinutes(a.startTime) <= openingMinute &&
        timeToMinutes(a.endTime) > openingMinute
    ).length;

    if (openingCoverage >= 1) {
      continue;
    }

    const unitReq =
      staffingRequirements.find(
        (req) =>
          req.unitName === unitName &&
          req.position.includes('Host') &&
          !req.position.includes('Senior Host') &&
          !req.position.includes('Break Cover')
      ) ||
      staffingRequirements.find(
        (req) => req.unitName === unitName && req.position.includes('Host') && !req.position.includes('Break Cover')
      );

    if (!unitReq) {
      continue;
    }

    const candidatePools = [
      ...staffByType.regularHostsFullShift,
      ...staffByType.regularHostsShortShift,
      ...staffByType.seniorHostsFullShift
    ];

    const openingHost = candidatePools.find((staff) => {
      if (assignedStaff.has(staff.name)) return false;
      if (timeToMinutes(staff.startTime) > openingMinute) return false;
      if (RETAIL_OPENING_SKILL_GATED.has(unitName) && !hasSkillForUnit(staff.name, unitName, skillsData)) return false;
      return true;
    });

    if (!openingHost) {
      log(`   ⚠️  ${unitName}: no available opening host for ${openingTime}`);
      continue;
    }

    assignments.push({
      unit: unitReq.unitName,
      position: unitReq.position,
      positionType: 'Host (Retail Opening)',
      staff: openingHost.name,
      zone,
      dayCode,
      trainingMatch: `${unitReq.unitName}-Host`,
      startTime: openingHost.startTime,
      endTime: openingHost.endTime,
      breakMinutes: openingHost.scheduledBreakMinutes || 0,
      isBreak: false,
      category: 'Retail'
    });

    assignedStaff.add(openingHost.name);
    const openingKey = `${unitReq.unitName}-${unitReq.position}`;
    filledPositions.set(openingKey, (filledPositions.get(openingKey) || 0) + 1);
    assignedCount += 1;
    log(`   ✅ ${openingHost.name} → ${unitReq.unitName} (opening cover ${openingTime}+)`);
  }

  return { assignedCount };
}

module.exports = {
  enforceRetailOpeningCoverage
};
