'use strict';

/**
 * STEP 5c: Assign Remaining/Generic Staff
 *
 * Handles three passes of remaining staff assignment:
 * - Generic staff → Rides positions (most likely match)
 * - GHI staff → Any GHI position (allow overstaffing)
 * - PASS 3: Flexible skill matching for remaining unfilled positions
 *
 * @param {object} options
 * @param {object} options.timegripData
 * @param {Array}  options.staffingRequirements
 * @param {Map}    options.filledPositions       - mutated in place
 * @param {Set}    options.assignedStaff         - mutated in place
 * @param {Array}  options.assignments           - mutated in place
 * @param {object} options.skillsData
 * @param {string} options.zone
 * @param {string} options.dayCode
 * @param {Function} options.isStaffAvailableForTime
 * @param {Function} options.getStaffWorkingHours
 * @param {Function} options.normalizeStaffName
 * @param {Function} options.staffHasSkill
 * @param {Function} options.matchPositionToSkill
 * @param {Function} options.getGenericSkillMatch
 * @returns {{ assignedCount: number }}
 */
function assignRemainingGenericStaff({
  timegripData,
  staffingRequirements,
  filledPositions,
  assignedStaff,
  assignments,
  skillsData,
  zone,
  dayCode,
  isStaffAvailableForTime,
  getStaffWorkingHours,
  normalizeStaffName,
  staffHasSkill,
  matchPositionToSkill,
  getGenericSkillMatch
}) {
  let assigned = 0;

  // ✅ FIX #8: Handle GENERIC staff (Alex Hawkins) - try to match to Rides/suitable positions
  const genericStaff = (timegripData.staffByFunction?.GENERIC || []).filter(s =>
    !assignedStaff.has(s.name)
  );

  if (genericStaff.length > 0) {
    console.log(`   Found ${genericStaff.length} generic staff`);

    for (const timegripStaff of genericStaff) {
      if (assignedStaff.has(timegripStaff.name)) continue;

      // Generic staff: try Rides positions first (most likely match)
      const ridePositions = staffingRequirements.filter(req =>
        req.unitName.includes('Rides') &&
        !req.position.includes('Break Cover') &&
        (filledPositions.get(req.position) || 0) < req.staffNeeded
      );

      if (ridePositions.length > 0) {
        // Sort by fill rate (unfilled first)
        const sorted = ridePositions.sort((a, b) => {
          const fillA = filledPositions.get(a.position) || 0;
          const fillB = filledPositions.get(b.position) || 0;
          return fillA - fillB;
        });

        const req = sorted[0];
        assignments.push({
          unit: req.unitName,
          position: req.position,
          positionType: 'Rides (Generic)',
          staff: timegripStaff.name,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${req.unitName}-Generic`,
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1f: Include break info
          isBreak: false
        });

        assignedStaff.add(timegripStaff.name);
        filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
        console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (GENERIC)`);
        assigned++;
      }
    }
  }

  // ✅ PASS 2b: GHI Staff - Assign to ANY GHI position (allow overstaffing)
  console.log('\n📋 PASS 2b: GHI Staff Assignment (Allow Overstaffing)');

  const ghiStaff = (timegripData.staffByFunction?.GENERIC || []).filter(s =>
    s.plannedFunction?.includes('GHI') &&
    !assignedStaff.has(s.name)
  );

  console.log(`   Found ${ghiStaff.length} generic GHI staff`);

  for (const timegripStaff of ghiStaff) {
    // Find ANY GHI position (NO fill check - allow overstaffing!)
    const ghiPositions = staffingRequirements.filter(req =>
      req.unitName.includes('GHI') &&
      !req.unitName.includes('Break Cover')  // ✅ NO fill check!
    );

    if (ghiPositions.length === 0) {
      console.log(`  ⚠️  ${timegripStaff.name}: No GHI positions exist`);
      continue;
    }

    // Pick the least-filled position (to balance load)
    const sorted = ghiPositions.sort((a, b) => {
      const fillA = filledPositions.get(a.position) || 0;
      const fillB = filledPositions.get(b.position) || 0;
      return fillA - fillB;
    });

    const requirement = sorted[0];

    // ✅ ASSIGN (allow overstaffing - no need to check if full)
    assignments.push({
      unit: requirement.unitName,
      position: requirement.position,
      positionType: 'Generic GHI (PASS 2b)',
      staff: timegripStaff.name,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: 'GHI - flexible position',
      startTime: timegripStaff.startTime,
      endTime: timegripStaff.endTime,
      breakMinutes: timegripStaff.scheduledBreakMinutes || 0,
      isBreak: false
    });

    assignedStaff.add(timegripStaff.name);
    filledPositions.set(requirement.position, (filledPositions.get(requirement.position) || 0) + 1);

    console.log(`  ✅ ${timegripStaff.name} → ${requirement.unitName} (${requirement.position})`);
    assigned++;
  }

  // ✅ PASS 3: Flexible Generic Skill Matching
  console.log('\n📋 PASS 3: Flexible Generic Skill Matching');
  const stillUnfilled = staffingRequirements.filter(req => {
    const filled = filledPositions.get(req.position) || 0;
    return filled < req.staffNeeded && !req.position.toLowerCase().includes('break cover');
  });

  if (stillUnfilled.length > 0) {
    const stillUnassigned = skillsData.staffWithGreen.filter(s => !assignedStaff.has(s.name));

    if (stillUnassigned.length > 0) {
      console.log(`\n🔄 Found ${stillUnassigned.length} unassigned staff and ${stillUnfilled.length} unfilled positions\n`);

      for (const staff of stillUnassigned) {
        if (assignedStaff.has(staff.name)) continue;

        if (!isStaffAvailableForTime(staff.name, '08:00', '16:00', timegripData)) continue;

        const workingHours = getStaffWorkingHours(staff.name, timegripData);
        if (!workingHours) continue;

        let matched = false;

        for (const req of stillUnfilled) {
          if (matched) break;
          if ((filledPositions.get(req.position) || 0) >= req.staffNeeded) continue;

          if (staffHasSkill(staff, req.unitName, req.position)) {
            const normalizedSearchName = normalizeStaffName(staff.name);
            const timegripStaff = timegripData.workingStaff.find(s => {
              const normalizedWorkingName = normalizeStaffName(s.name);
              return normalizedWorkingName === normalizedSearchName;
            });
            const staffDisplayName = timegripStaff ? timegripStaff.name : staff.name;

            const skillType = matchPositionToSkill(req.position);
            const genericSkill = getGenericSkillMatch(req.unitName, req.position);
            const trainingMatch = genericSkill || `${req.unitName}-${skillType}`;

            assignments.push({
              unit: req.unitName,
              position: req.position,
              positionType: skillType,
              staff: staffDisplayName,
              zone: zone,
              dayCode: dayCode,
              trainingMatch: trainingMatch,
              startTime: workingHours.startTime,
              endTime: workingHours.endTime,
              breakMinutes: workingHours.breakMinutes || 0,  // ✅ FIX #1f: Include break info
              isBreak: false
            });

            assignedStaff.add(staff.name);
            filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
            console.log(`  ✅ ${staff.name} → ${req.unitName} (flexible ${trainingMatch}) ${workingHours.startTime}-${workingHours.endTime}`);
            matched = true;
            assigned++;
          }
        }

        if (!matched) {
          console.log(`  ⚠️  ${staff.name} has no matching unfilled positions`);
        }
      }
    }
  }

  return { assignedCount: assigned };
}

module.exports = { assignRemainingGenericStaff };
