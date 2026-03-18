function assignRemainingHostsStep4(options) {
  const {
    staffingRequirements,
    staffByType,
    assignedStaff,
    assignments,
    filledPositions,
    zone,
    dayCode,
    skillsData,
    getCategoryFromUnit,
    hasSkillForUnit,
    timeToMinutes,
    log = console.log
  } = options;

  log('\n   📍 STEP 4: Assigning remaining staff...');

  const hasUnfilledAdmissionsHost = staffingRequirements.some((req) => {
    if (
      !req.position.includes('Host') ||
      req.position.includes('Senior Host') ||
      req.position.includes('Break Cover')
    ) {
      return false;
    }
    if (getCategoryFromUnit(req.unitName) !== 'Admissions') {
      return false;
    }
    const unitPositionKey = `${req.unitName}-${req.position}`;
    return (filledPositions.get(unitPositionKey) || 0) < req.staffNeeded;
  });

  if (hasUnfilledAdmissionsHost) {
    log('   ⚠️  Admissions host gaps still open - delaying Retail min-passes (Explorer Supplies/APGS)');
  }

  let assignedCount = 0;

  // ----------------------------------------------------------------
  // Explorer Supplies minimum 2
  // ----------------------------------------------------------------
  const suppliesReq = staffingRequirements.find((r) => r.unitName === 'Explorer Supplies');
  if (suppliesReq && !hasUnfilledAdmissionsHost) {
    const sKey = `${suppliesReq.unitName}-${suppliesReq.position}`;
    const sFilled = assignments.filter((a) => a.unit === 'Explorer Supplies' && !a.isBreak).length;
    if (sFilled < 2) {
      for (const host of staffByType.regularHostsFullShift.filter((s) => !assignedStaff.has(s.name))) {
        if (assignments.filter((a) => a.unit === 'Explorer Supplies' && !a.isBreak).length >= 2) {
          break;
        }
        assignments.push({
          unit: 'Explorer Supplies',
          position: suppliesReq.position,
          positionType: 'Host (Supplies Min)',
          staff: host.name,
          zone,
          dayCode,
          trainingMatch: 'Explorer Supplies-Host',
          startTime: host.startTime,
          endTime: host.endTime,
          breakMinutes: host.scheduledBreakMinutes || 0,
          isBreak: false,
          category: 'Retail'
        });
        assignedStaff.add(host.name);
        filledPositions.set(sKey, (filledPositions.get(sKey) || 0) + 1);
        assignedCount += 1;
        log(`   📦 ${host.name} → Explorer Supplies (min 2)`);
      }
    }
  }

  // ----------------------------------------------------------------
  // APGS opening target (min 2 at 10:00) then overall min 3
  // ----------------------------------------------------------------
  const APGS_UNIT = 'Adventure Point Gift Shop';
  const APGS_OPENING_TIME = '10:00';
  const APGS_OPENING_TARGET = 2;
  const APGS_OVERALL_TARGET = 3;

  const apgsReqMin = staffingRequirements.find(
    (r) => r.unitName === APGS_UNIT && r.position.includes('Host') && !r.position.includes('Senior')
  );

  if (apgsReqMin) {
    const aKey = `${apgsReqMin.unitName}-${apgsReqMin.position}`;
    const openingMinute = timeToMinutes(APGS_OPENING_TIME);

    const countOpeningCoverage = () =>
      assignments.filter(
        (a) =>
          a.unit === APGS_UNIT &&
          !a.isBreak &&
          a.staff !== 'UNFILLED' &&
          timeToMinutes(a.startTime) <= openingMinute &&
          timeToMinutes(a.endTime) > openingMinute
      ).length;

    const apgsOpenCoverage = countOpeningCoverage();

    if (apgsOpenCoverage < APGS_OPENING_TARGET) {
      log(`   🛍️  APGS opening coverage ${apgsOpenCoverage}/${APGS_OPENING_TARGET} at ${APGS_OPENING_TIME}, topping up...`);

      for (const host of staffByType.regularHostsFullShift.filter(
        (s) => !assignedStaff.has(s.name) && timeToMinutes(s.startTime) <= openingMinute
      )) {
        if (countOpeningCoverage() >= APGS_OPENING_TARGET) {
          break;
        }
        assignments.push({
          unit: APGS_UNIT,
          position: apgsReqMin.position,
          positionType: 'Host (APGS Opening)',
          staff: host.name,
          zone,
          dayCode,
          trainingMatch: `${APGS_UNIT}-Host`,
          startTime: host.startTime,
          endTime: host.endTime,
          breakMinutes: host.scheduledBreakMinutes || 0,
          isBreak: false,
          category: 'Retail'
        });
        assignedStaff.add(host.name);
        filledPositions.set(aKey, (filledPositions.get(aKey) || 0) + 1);
        assignedCount += 1;
        log(`   🛍️  ${host.name} → APGS (opening cover ${host.startTime}-${host.endTime})`);
      }

      const finalOpenCoverage = countOpeningCoverage();
      if (finalOpenCoverage < APGS_OPENING_TARGET) {
        log(`   ⚠️  APGS opening still below target: ${finalOpenCoverage}/${APGS_OPENING_TARGET} at ${APGS_OPENING_TIME}`);
      }
    }

    if (!hasUnfilledAdmissionsHost) {
      const sweetFilled = assignments.filter((a) => a.unit === 'Sweet Shop' && !a.isBreak).length;
      const sealifeFilled = assignments.filter((a) => a.unit === 'Sealife' && !a.isBreak).length;
      if (sweetFilled === 0 || sealifeFilled === 0) {
        log(
          `   ⚠️  APGS min-pass skipped: preserve hosts for Sweet/Sealife coverage first (Sweet=${sweetFilled}, Sealife=${sealifeFilled})`
        );
      } else {
        const aFilled = assignments.filter((a) => a.unit === APGS_UNIT && !a.isBreak).length;
        if (aFilled < APGS_OVERALL_TARGET) {
          for (const host of staffByType.regularHostsFullShift.filter((s) => !assignedStaff.has(s.name))) {
            if (assignments.filter((a) => a.unit === APGS_UNIT && !a.isBreak).length >= APGS_OVERALL_TARGET) {
              break;
            }
            assignments.push({
              unit: APGS_UNIT,
              position: apgsReqMin.position,
              positionType: 'Host (APGS Min)',
              staff: host.name,
              zone,
              dayCode,
              trainingMatch: `${APGS_UNIT}-Host`,
              startTime: host.startTime,
              endTime: host.endTime,
              breakMinutes: host.scheduledBreakMinutes || 0,
              isBreak: false,
              category: 'Retail'
            });
            assignedStaff.add(host.name);
            filledPositions.set(aKey, (filledPositions.get(aKey) || 0) + 1);
            assignedCount += 1;
            log(`   🛍️  ${host.name} → APGS (min ${APGS_OVERALL_TARGET})`);
          }
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Remaining staff → any unfilled Host position
  // ----------------------------------------------------------------
  const STEP4_SKILL_REQUIRED = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sweet Shop', 'Sealife']);

  const allRemainingStaff = [
    ...staffByType.seniorHostsFullShift.filter((s) => !assignedStaff.has(s.name)),
    ...staffByType.regularHostsFullShift.filter((s) => !assignedStaff.has(s.name)),
    ...staffByType.regularHostsShortShift.filter((s) => !assignedStaff.has(s.name))
  ];

  for (const staff of allRemainingStaff) {
    if (assignedStaff.has(staff.name)) {
      continue;
    }

    const unfilledReq = staffingRequirements.find((req) => {
      const isHost = req.position.includes('Host');
      const category = getCategoryFromUnit(req.unitName);
      const isRetailAdmissions = category === 'Retail' || category === 'Admissions';
      const notBreakCover = !req.position.includes('Break Cover');
      const unitPositionKey = `${req.unitName}-${req.position}`;
      const needsStaff = (filledPositions.get(unitPositionKey) || 0) < req.staffNeeded;

      const requiresSeniorHost = req.position.includes('Senior Host');
      const isSeniorHost = staffByType.seniorHostsFullShift.includes(staff);

      if (requiresSeniorHost && !isSeniorHost) {
        return false;
      }
      if (STEP4_SKILL_REQUIRED.has(req.unitName) && !hasSkillForUnit(staff.name, req.unitName, skillsData)) {
        return false;
      }

      return isHost && isRetailAdmissions && notBreakCover && needsStaff;
    });

    if (unfilledReq) {
      assignments.push({
        unit: unfilledReq.unitName,
        position: unfilledReq.position,
        positionType: 'Host (Remaining)',
        staff: staff.name,
        zone,
        dayCode,
        trainingMatch: `${unfilledReq.unitName}-Host`,
        startTime: staff.startTime,
        endTime: staff.endTime,
        breakMinutes: staff.scheduledBreakMinutes || 0,
        isBreak: false,
        category: getCategoryFromUnit(unfilledReq.unitName)
      });

      assignedStaff.add(staff.name);
      const unitPosKey = `${unfilledReq.unitName}-${unfilledReq.position}`;
      filledPositions.set(unitPosKey, (filledPositions.get(unitPosKey) || 0) + 1);
      assignedCount += 1;
      log(`   ✅ ${staff.name} → ${unfilledReq.unitName} (${staff.startTime}-${staff.endTime})`);
    }
  }

  return { assignedCount };
}

module.exports = {
  assignRemainingHostsStep4
};
