const { timeToMinutes, minutesToTime } = require('../../utils/breakCalculator');
const { getStaffWorkingHours, normalizeStaffName } = require('../../utils/staffTimegripUtils');

function createBreakPlanningHelpers({
  canonicalizeUnitName,
  getCategoryFromUnit,
  hasSkillForUnit,
  getStaffTrainedUnits
}) {
  function calculateWorkHours(startTime, endTime, breakMinutes) {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const totalMinutes = endMins - startMins;
    const workMinutes = totalMinutes - (breakMinutes || 0);
    return workMinutes / 60;
  }

  function snapToNearestHour(minutesSinceMidnight) {
    const HOURLY_SLOTS = [
      { start: '11:00', end: '11:45', startMin: 660, endMin: 705 },
      { start: '12:00', end: '12:45', startMin: 720, endMin: 765 },
      { start: '13:00', end: '13:45', startMin: 780, endMin: 825 },
      { start: '14:00', end: '14:45', startMin: 840, endMin: 885 },
      { start: '15:00', end: '15:45', startMin: 900, endMin: 945 }
    ];

    for (const slot of HOURLY_SLOTS) {
      if (slot.startMin >= minutesSinceMidnight) {
        return slot;
      }
    }

    return HOURLY_SLOTS[HOURLY_SLOTS.length - 1];
  }

  function getPositionForUnit(unit) {
    const canonicalUnit = canonicalizeUnitName(unit);
    const positionMap = {
      'Gift Shop': 'Retail Host',
      'Adventures Point Gift Shop': 'Retail Host',
      'Sweet Shop': 'Retail Host',
      'Sealife': 'Retail Host',
      'Lodge Entrance': 'Admissions Host',
      'Azteca Entrance': 'Admissions Host',
      'Explorer Entrance': 'Admissions Host',
      'Schools Entrance': 'Admissions Host',
      'Car Parks - Staff Car Park': 'Car Parks Host',
      'Car Parks - Hotel Car Park': 'Car Parks Host'
    };

    return positionMap[canonicalUnit] || `${canonicalUnit} Host`;
  }

  function getPreferredBreakSlot(assignment, breakSlots) {
    const startTime = assignment.startTime;
    const endTime = assignment.endTime;
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = timeToMinutes(endTime);
    const isSeniorHost = assignment.position && assignment.position.includes('Senior Host');

    if (endMinutes <= 900) {
      console.log(`   🕐 ${assignment.staff || 'Staff'}: Early closer (ends ${endTime}) → 11:00 break`);
      return breakSlots[0];
    }

    if (isSeniorHost) {
      console.log(`   👔 ${assignment.staff || 'Staff'}: Senior Host → 12:00+ break`);
      return breakSlots[1];
    }

    if (startMinutes < 540) {
      console.log(`   🌅 ${assignment.staff || 'Staff'}: Early starter (${startTime}) → 11:00 break`);
      return breakSlots[0];
    }

    if (startMinutes >= 540 && startMinutes < 645) {
      console.log(`   🕐 ${assignment.staff || 'Staff'}: Mid-shift starter (${startTime}) → 12:00 break`);
      return breakSlots[1];
    }

    if (startMinutes >= 660) {
      console.log(`   ⏰ ${assignment.staff || 'Staff'}: Late starter (${startTime}) → 14:00 break`);
      return breakSlots[3];
    }

    return breakSlots[0];
  }

  function identifySingleCoverageUnits(assignments) {
    const unitStaffCount = new Map();

    for (const assignment of assignments) {
      if (assignment.isBreakCover || assignment.isBreak) {
        continue;
      }

      const category = getCategoryFromUnit(assignment.unit);
      if (category === 'Rides' || category === 'Car Parks' || category === 'GHI') {
        continue;
      }

      const unit = assignment.unit;
      if (!unit || unit.includes('Break Cover')) {
        continue;
      }

      unitStaffCount.set(unit, (unitStaffCount.get(unit) || 0) + 1);
    }

    const singleCoverageUnits = [];
    for (const [unit, count] of unitStaffCount.entries()) {
      if (count === 1) {
        singleCoverageUnits.push(unit);
      }
    }

    console.log(`\n🔍 Single-Coverage Units Analysis:`);
    console.log(`   Total retail/admissions units: ${unitStaffCount.size}`);
    console.log(`   Single-coverage units (1 person): ${singleCoverageUnits.length}`);
    if (singleCoverageUnits.length > 0) {
      console.log(`   Units: ${singleCoverageUnits.join(', ')}`);
    }

    return { singleCoverageUnits, unitStaffCount };
  }

  function unitsMatchForBreakCover(skillUnit, breakUnit) {
    const normalize = (str) => str
      .toLowerCase()
      .replace(/-op|-att|-host|operator|attendant|host|driver|skill/gi, '')
      .replace(/\s+/g, '')
      .trim();

    const skillNorm = normalize(skillUnit);
    const breakNorm = normalize(breakUnit);

    return skillNorm === breakNorm ||
      skillNorm.includes(breakNorm) ||
      breakNorm.includes(skillNorm);
  }

  function staggerBreaksByUnit(allAssignments) {
    console.log(`\n🔄 Applying Break Staggering Logic...`);
    const unitBreaks = {};
    const unitStaffCount = {};

    for (const assignment of allAssignments) {
      if (!assignment.isBreak && assignment.unit && assignment.unit !== 'Zonal Lead') {
        unitStaffCount[assignment.unit] = (unitStaffCount[assignment.unit] || 0) + 1;
      }
    }

    for (let index = 0; index < allAssignments.length; index++) {
      const assignment = allAssignments[index];
      if (!assignment.isBreak) {
        continue;
      }

      if (!unitBreaks[assignment.unit]) {
        unitBreaks[assignment.unit] = [];
      }

      unitBreaks[assignment.unit].push({
        staff: assignment.staff,
        startMin: timeToMinutes(assignment.startTime),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        index
      });
    }

    const HOURLY_SLOTS = [660, 720, 780, 840, 900];
    const adjustedAssignments = [...allAssignments];

    for (const [unit, breaks] of Object.entries(unitBreaks)) {
      const totalStaff = unitStaffCount[unit] || 1;
      const totalBreaks = breaks.length;

      console.log(`  📊 ${unit}: ${totalStaff} staff, ${totalBreaks} breaks to stagger`);

      if (totalBreaks >= totalStaff) {
        console.log(`  ⚠️  ${unit}: All/most staff need breaks - forcing stagger`);
        breaks.sort((a, b) => a.startMin - b.startMin);

        for (let index = 0; index < breaks.length; index++) {
          const slotIndex = index % HOURLY_SLOTS.length;
          const newSlot = HOURLY_SLOTS[slotIndex];
          const currentBreak = breaks[index];

          if (currentBreak.startMin !== newSlot) {
            const slotTime = minutesToTime(newSlot);
            const endSlotTime = minutesToTime(newSlot + 30);
            console.log(`  🔄 ${currentBreak.staff}: ${currentBreak.startTime}-${currentBreak.endTime} → ${slotTime}-${endSlotTime}`);
            adjustedAssignments[currentBreak.index].startTime = slotTime;
            adjustedAssignments[currentBreak.index].endTime = endSlotTime;
          }
        }

        console.log(`  ✅ ${unit}: Breaks staggered across ${breaks.length} slots`);
        continue;
      }

      if (breaks.length < 2) {
        continue;
      }

      breaks.sort((a, b) => a.startMin - b.startMin);
      const usedSlots = new Set([breaks[0].startMin]);

      for (let index = 1; index < breaks.length; index++) {
        const currentBreak = breaks[index];
        if (!usedSlots.has(currentBreak.startMin)) {
          usedSlots.add(currentBreak.startMin);
          continue;
        }

        let newSlot = null;
        for (const slot of HOURLY_SLOTS) {
          if (!usedSlots.has(slot) && slot > currentBreak.startMin) {
            newSlot = slot;
            break;
          }
        }

        if (newSlot) {
          const slotTime = minutesToTime(newSlot);
          const endSlotTime = minutesToTime(newSlot + 30);
          console.log(`  🔄 ${currentBreak.staff} (${unit}): ${currentBreak.startTime}-${currentBreak.endTime} → ${slotTime}-${endSlotTime}`);
          adjustedAssignments[currentBreak.index].startTime = slotTime;
          adjustedAssignments[currentBreak.index].endTime = endSlotTime;
          usedSlots.add(newSlot);
        }
      }

      console.log(`  ✅ ${unit}: Breaks staggered (${breaks.length} staff)`);
    }

    return adjustedAssignments;
  }

  function assignSmartBreakCover(assignments, breakAssignments, breakCoverStaff, timegripData, skillsData) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`🎯 SMART BREAK COVER SYSTEM V1.0`);
    console.log(`═══════════════════════════════════════════════════════════`);

    const smartAssignments = [];
    const busyWindows = new Map();
    const { singleCoverageUnits } = identifySingleCoverageUnits(assignments);

    console.log(`\n📊 Break Coverage Analysis:`);
    console.log(`   Total breaks to cover: ${breakAssignments.length}`);
    console.log(`   Available break cover staff: ${breakCoverStaff.length}`);

    console.log(`\n🎯 Phase 1: Single-Coverage Units (Breaks When BC Available)`);

    for (const unit of singleCoverageUnits) {
      const unitBreaks = breakAssignments.filter((breakAssignment) => breakAssignment.unit === unit);
      if (unitBreaks.length === 0) {
        continue;
      }

      const breakToMove = unitBreaks[0];
      const matchingBC = breakCoverStaff.find((breakCoverer) => {
        const bcType = (breakCoverer.plannedFunction || breakCoverer.scheduledFunction || '').toLowerCase();
        const category = getCategoryFromUnit(unit);

        if (category === 'Rides' && !bcType.includes('ride')) {
          return false;
        }

        if ((category === 'Retail' || category === 'Admissions') && bcType.includes('ride')) {
          return false;
        }

        return hasSkillForUnit(breakCoverer.name, unit, skillsData);
      });

      if (!matchingBC) {
        console.log(`   ⚠️  ${unit}: No matching break cover available`);
        continue;
      }

      const bcHours = getStaffWorkingHours(matchingBC.name, timegripData);
      if (!bcHours) {
        console.log(`   ⚠️  ${unit}: Could not find working hours for ${matchingBC.name}`);
        continue;
      }

      const bcArrivalMinutes = timeToMinutes(bcHours.startTime);
      const breakDuration = breakToMove.endMinutes - breakToMove.startMinutes;
      const breakSlots = [660, 720, 780, 840, 900];
      const availableSlot = breakSlots.find((slot) => slot >= bcArrivalMinutes);

      if (!availableSlot) {
        console.log(`   ⚠️  ${unit}: BC arrives too late (${bcHours.startTime}) for any break slot`);
        continue;
      }

      const newStartMinutes = availableSlot;
      const newEndMinutes = availableSlot + breakDuration;
      const newStartTime = minutesToTime(newStartMinutes);
      const newEndTime = minutesToTime(newEndMinutes);

      breakToMove.startTime = newStartTime;
      breakToMove.endTime = newEndTime;
      breakToMove.startMinutes = newStartMinutes;
      breakToMove.endMinutes = newEndMinutes;

      smartAssignments.push({
        unit,
        position: `${unit} - Break Cover`,
        staff: matchingBC.name,
        startTime: newStartTime,
        endTime: newEndTime,
        positionType: 'Smart Break Cover (Single Unit)',
        zone: assignments[0]?.zone,
        dayCode: assignments[0]?.dayCode,
        trainingMatch: `${unit}-Break Cover`,
        coveringStaff: breakToMove.staff,
        isBreak: false,
        isSmartBreakCover: true,
        isSingleCoverage: true
      });

      if (!busyWindows.has(matchingBC.name)) {
        busyWindows.set(matchingBC.name, []);
      }
      busyWindows.get(matchingBC.name).push({ start: newStartMinutes, end: newEndMinutes });

      console.log(`   ✅ ${matchingBC.name} → ${unit} (${newStartTime}-${newEndTime}) [covers ${breakToMove.staff}]`);
    }

    console.log(`\n🎯 Phase 2: Multi-Person Units (Standard Break Coverage)`);
    const sortedBreaks = [...breakAssignments].sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));

    for (const breakNeeded of sortedBreaks) {
      if (smartAssignments.some((assignment) => assignment.unit === breakNeeded.unit && assignment.coveringStaff === breakNeeded.staff)) {
        continue;
      }

      const staffPresentDuringBreak = assignments.filter((assignment) =>
        assignment.unit === breakNeeded.unit &&
        assignment.staff !== breakNeeded.staff &&
        !assignment.isBreak &&
        timeToMinutes(assignment.startTime) <= timeToMinutes(breakNeeded.startTime) &&
        timeToMinutes(assignment.endTime) >= timeToMinutes(breakNeeded.endTime)
      );

      if (staffPresentDuringBreak.length >= 2) {
        console.log(`  ✅ ${breakNeeded.unit}: Already has ${staffPresentDuringBreak.length} staff present during ${breakNeeded.staff}'s break (no BC needed)`);
        continue;
      }

      const breakStart = timeToMinutes(breakNeeded.startTime);
      const breakEnd = timeToMinutes(breakNeeded.endTime);
      const category = getCategoryFromUnit(breakNeeded.unit);

      const matchingBC = breakCoverStaff.find((breakCoverer) => {
        const bcType = (breakCoverer.plannedFunction || breakCoverer.scheduledFunction || '').toLowerCase();
        if (category === 'Rides' && !bcType.includes('ride')) {
          return false;
        }
        if ((category === 'Retail' || category === 'Admissions') && bcType.includes('ride')) {
          return false;
        }
        if (!hasSkillForUnit(breakCoverer.name, breakNeeded.unit, skillsData)) {
          return false;
        }

        const bcHours = getStaffWorkingHours(breakCoverer.name, timegripData);
        if (!bcHours) {
          return false;
        }

        const bcStart = timeToMinutes(bcHours.startTime);
        const bcEnd = timeToMinutes(bcHours.endTime);
        if (bcStart > breakStart || bcEnd < breakEnd) {
          return false;
        }

        const windows = busyWindows.get(breakCoverer.name) || [];
        const clashes = windows.some((window) => !(breakEnd <= window.start || breakStart >= window.end));
        return !clashes;
      });

      if (!matchingBC) {
        console.log(`  ⚠️  ${breakNeeded.unit}: No break cover available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
        continue;
      }

      if (!busyWindows.has(matchingBC.name)) {
        busyWindows.set(matchingBC.name, []);
      }
      busyWindows.get(matchingBC.name).push({ start: breakStart, end: breakEnd });

      smartAssignments.push({
        unit: breakNeeded.unit,
        position: `${breakNeeded.unit} - Break Cover`,
        staff: matchingBC.name,
        startTime: breakNeeded.startTime,
        endTime: breakNeeded.endTime,
        positionType: 'Smart Break Cover',
        zone: assignments[0]?.zone,
        dayCode: assignments[0]?.dayCode,
        trainingMatch: `${breakNeeded.unit}-Break Cover`,
        coveringStaff: breakNeeded.staff,
        isBreak: false,
        isSmartBreakCover: true
      });

      console.log(`  ✅ ${matchingBC.name} → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
    }

    console.log(`\n📊 Smart Break Cover Summary:`);
    console.log(`   Total break cover assignments: ${smartAssignments.length}`);
    console.log(`   Single-coverage units (10:30 breaks): ${smartAssignments.filter((assignment) => assignment.isSingleCoverage).length}`);
    console.log(`   Multi-person unit coverage: ${smartAssignments.filter((assignment) => !assignment.isSingleCoverage).length}`);

    return smartAssignments;
  }

  function calculateAllBreaksNeeded(assignmentsToProcess, timegripData) {
    console.log('\n🕐 Calculating staggered break schedule...');

    const breakAssignments = [];
    const staffAssignments = new Map();

    for (const assignment of assignmentsToProcess) {
      if (assignment.isBreak || assignment.unit === 'Zonal Lead') {
        continue;
      }

      if (!staffAssignments.has(assignment.staff)) {
        staffAssignments.set(assignment.staff, []);
      }
      staffAssignments.get(assignment.staff).push(assignment);
    }

    let nonRidesStaffCount = 0;
    for (const [staffName, assignments] of staffAssignments.entries()) {
      const sorted = assignments.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
      const primaryAssignment = sorted[0];
      const breakMinutes = Math.max(...sorted.map((assignment) => assignment.breakMinutes || 0));
      const shiftStart = sorted[0].startTime;
      const shiftEnd = sorted[sorted.length - 1].endTime;
      const workHours = calculateWorkHours(shiftStart, shiftEnd, breakMinutes || 0);

      if (breakMinutes && breakMinutes > 0 && workHours >= 4.0 && !primaryAssignment.isBreakCover && primaryAssignment.category !== 'Rides') {
        nonRidesStaffCount++;
      }
    }

    const slotsPerTime = Math.ceil(nonRidesStaffCount / 5);
    const breakSlots = [
      { start: '11:00', end: '11:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Early' },
      { start: '12:00', end: '12:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Peak' },
      { start: '13:00', end: '13:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Late' },
      { start: '14:00', end: '14:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'VeryLate' },
      { start: '15:00', end: '15:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Latest' }
    ];

    console.log(`   📊 Creating break slots for ${nonRidesStaffCount} non-rides staff (${slotsPerTime} per time slot)`);

    const ridesBreaksToAssign = [];

    for (const [staffName, assignments] of staffAssignments.entries()) {
      const sorted = assignments.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
      const shiftStart = sorted[0].startTime;
      const shiftEnd = sorted[sorted.length - 1].endTime;
      const primaryAssignment = sorted[0];
      const breakMinutes = Math.max(...sorted.map((assignment) => assignment.breakMinutes || 0));
      const isSeniorHost = primaryAssignment.position && primaryAssignment.position.includes('Senior Host');

      if ((!breakMinutes || breakMinutes === 0) && !isSeniorHost) {
        if (primaryAssignment.isBreakCover) {
          console.log(`   🔄 ${staffName}: Break Cover (no personal break)`);
        }
        continue;
      }

      const actualBreakMinutes = isSeniorHost && (!breakMinutes || breakMinutes === 0) ? 45 : breakMinutes;
      if (primaryAssignment.isBreakCover) {
        console.log(`   🔄 ${staffName}: Break Cover (no personal break)`);
        continue;
      }

      const workHours = calculateWorkHours(shiftStart, shiftEnd, actualBreakMinutes);
      if (workHours < 4.0 && !isSeniorHost) {
        console.log(`   ⏭️  ${staffName}: ${workHours.toFixed(2)}h shift (no break required)`);
        continue;
      }

      const isRides = primaryAssignment.category === 'Rides';
      if (isRides) {
        ridesBreaksToAssign.push({
          staffName,
          unit: primaryAssignment.unit,
          position: primaryAssignment.position,
          shiftStart,
          shiftEnd,
          breakMinutes: actualBreakMinutes
        });
        continue;
      }

      const unit = primaryAssignment.unit;
      let targetSlot = getPreferredBreakSlot(primaryAssignment, breakSlots);
      const category = primaryAssignment.category;
      const shiftStartMin = timeToMinutes(primaryAssignment.startTime || '09:00');
      const isEarlyStarter = shiftStartMin < 540;
      const isLateStarter = shiftStartMin >= 660;
      const isMidStarter = !isEarlyStarter && !isLateStarter;

      if (primaryAssignment.unit === 'Azteca Entrance' && isEarlyStarter) {
        targetSlot = breakSlots[0];
        console.log(`   🏛️  ${staffName}: Azteca Entrance → forced 11:00 break`);
      } else {
        const unitForCheck = primaryAssignment.unit;
        const unitTotal = assignmentsToProcess.filter((assignment) => assignment.unit === unitForCheck && !assignment.isBreakCover && !assignment.isBreak).length;
        const isTwoPersonUnit = unitTotal <= 2;

        if (isTwoPersonUnit) {
          const sameUnitInSlot = targetSlot.assigned.filter((assignedStaffName) => {
            const assignment = assignmentsToProcess.find((candidate) => candidate.staff === assignedStaffName);
            return assignment && assignment.unit === unitForCheck;
          }).length;

          if (sameUnitInSlot > 0) {
            const currentIndex = breakSlots.findIndex((slot) => slot.start === targetSlot.start);
            for (let index = currentIndex + 1; index < breakSlots.length; index++) {
              const nextSlot = breakSlots[index];
              const sameUnitNext = nextSlot.assigned.filter((assignedStaffName) => {
                const assignment = assignmentsToProcess.find((candidate) => candidate.staff === assignedStaffName);
                return assignment && assignment.unit === unitForCheck;
              }).length;

              if (sameUnitNext === 0) {
                console.log(`   🏪 ${staffName}: 2-person unit stagger (${unitForCheck}), moving ${targetSlot.start} → ${nextSlot.start}`);
                targetSlot = nextSlot;
                break;
              }
            }
          }

          const finalMinutes = timeToMinutes(targetSlot.start);
          if (isEarlyStarter && finalMinutes > 780) {
            targetSlot = breakSlots[2];
          } else if (isMidStarter && finalMinutes > 840) {
            targetSlot = breakSlots[3];
          }
        } else {
          const sameCategoryInSlot = targetSlot.assigned.filter((assignedStaffName) => {
            const assignment = assignmentsToProcess.find((candidate) => candidate.staff === assignedStaffName);
            return assignment && assignment.category === category;
          }).length;
          const categoryLimits = { 'Car Parks': 1, 'GHI': 2, 'Admissions': 2, 'Retail': 2 };
          const maxForCategory = categoryLimits[category] || 2;

          if (sameCategoryInSlot >= maxForCategory) {
            const currentIndex = breakSlots.findIndex((slot) => slot.start === targetSlot.start);
            const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020;
            for (let index = currentIndex + 1; index < breakSlots.length; index++) {
              const nextSlot = breakSlots[index];
              const nextSlotMinutes = timeToMinutes(nextSlot.start);
              if (isEarlyStarter && nextSlotMinutes > 780) {
                targetSlot = breakSlots[2];
                console.log(`   🌅 ${staffName}: Early starter cascade capped at 13:00`);
                break;
              }
              if (isMidStarter && nextSlotMinutes > 840) {
                targetSlot = breakSlots[3];
                console.log(`   🕐 ${staffName}: Mid-starter cascade capped at 14:00`);
                break;
              }
              if (isEarlyClose && nextSlot.start === '15:00') {
                continue;
              }

              const sameCategoryNext = nextSlot.assigned.filter((assignedStaffName) => {
                const assignment = assignmentsToProcess.find((candidate) => candidate.staff === assignedStaffName);
                return assignment && assignment.category === category;
              }).length;

              if (sameCategoryNext < maxForCategory && nextSlot.assigned.length < nextSlot.capacity) {
                console.log(`   🔄 ${staffName}: ${sameCategoryInSlot} ${category} already at ${targetSlot.start}, moving to ${nextSlot.start}`);
                targetSlot = nextSlot;
                break;
              }
            }
          }

          if (targetSlot.assigned.length >= targetSlot.capacity) {
            const currentIndex = breakSlots.findIndex((slot) => slot.start === targetSlot.start);
            const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020;
            for (let index = currentIndex + 1; index < breakSlots.length; index++) {
              const nextSlot = breakSlots[index];
              const nextSlotMinutes = timeToMinutes(nextSlot.start);
              if (isEarlyStarter && nextSlotMinutes > 780) {
                targetSlot = breakSlots[2];
                break;
              }
              if (isMidStarter && nextSlotMinutes > 840) {
                targetSlot = breakSlots[3];
                break;
              }
              if (isEarlyClose && nextSlot.start === '15:00') {
                continue;
              }
              if (nextSlot.assigned.length < nextSlot.capacity) {
                console.log(`   🔄 ${staffName}: Slot ${targetSlot.start} full, moving to ${nextSlot.start}`);
                targetSlot = nextSlot;
                break;
              }
            }
          }

          const finalMinutes = timeToMinutes(targetSlot.start);
          if (isEarlyStarter && finalMinutes > 780) {
            targetSlot = breakSlots[2];
            console.log(`   🔒 ${staffName}: Hard cap → 13:00`);
          } else if (isMidStarter && finalMinutes > 840) {
            targetSlot = breakSlots[3];
            console.log(`   🔒 ${staffName}: Hard cap → 14:00`);
          } else if (isLateStarter && finalMinutes > 900) {
            targetSlot = breakSlots[4];
            console.log(`   🔒 ${staffName}: Hard cap → 15:00`);
          }
        }
      }

      const breakEndCheck = timeToMinutes(targetSlot.start) + (actualBreakMinutes || 45);
      const actualShiftEnd = timeToMinutes(shiftEnd);
      if (breakEndCheck > actualShiftEnd - 30) {
        const safeSlot = breakSlots.find((slot) => timeToMinutes(slot.start) + (actualBreakMinutes || 45) <= actualShiftEnd - 30);
        if (safeSlot) {
          console.log(`   ⏰ ${staffName}: Break would overrun shift end (${shiftEnd}), moving to ${safeSlot.start}`);
          targetSlot = safeSlot;
        } else {
          console.log(`   ⚠️  ${staffName}: No safe break slot found before shift end (${shiftEnd})`);
        }
      }

      if (targetSlot && targetSlot.assigned.length < targetSlot.capacity) {
        targetSlot.assigned.push(staffName);
        const breakDuration = actualBreakMinutes || 30;
        const actualEndTime = minutesToTime(timeToMinutes(targetSlot.start) + breakDuration);

        breakAssignments.push({
          unit: primaryAssignment.unit,
          position: 'BREAK',
          staff: staffName,
          startTime: targetSlot.start,
          endTime: actualEndTime,
          startMinutes: timeToMinutes(targetSlot.start),
          endMinutes: timeToMinutes(actualEndTime),
          isBreak: true,
          reason: `${targetSlot.label} slot`,
          category: primaryAssignment.category
        });

        console.log(`   ☕ ${staffName} (${unit}): ${targetSlot.start}-${actualEndTime} [${targetSlot.label}]`);
        continue;
      }

      const isSeniorHostOverflow = primaryAssignment.position && primaryAssignment.position.includes('Senior Host');
      let alternateSlot;

      if (isSeniorHostOverflow) {
        const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020;
        alternateSlot = breakSlots.find((slot) => {
          if (timeToMinutes(slot.start) < timeToMinutes('12:00')) {
            return false;
          }
          if (isEarlyClose && slot.start === '15:00') {
            return false;
          }
          return slot.assigned.length < slot.capacity;
        });

        if (!alternateSlot) {
          console.log(`   ⚠️  ${staffName}: All Senior Host slots (12:00+) full!`);
        }
      } else {
        const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020;
        alternateSlot = breakSlots.find((slot) => {
          if (isEarlyClose && slot.start === '15:00') {
            return false;
          }
          return slot.assigned.length < slot.capacity;
        });
      }

      if (alternateSlot) {
        alternateSlot.assigned.push(staffName);
        const breakDuration = actualBreakMinutes || 30;
        const actualEndTime = minutesToTime(timeToMinutes(alternateSlot.start) + breakDuration);

        breakAssignments.push({
          unit: primaryAssignment.unit,
          position: 'BREAK',
          staff: staffName,
          startTime: alternateSlot.start,
          endTime: actualEndTime,
          startMinutes: timeToMinutes(alternateSlot.start),
          endMinutes: timeToMinutes(actualEndTime),
          isBreak: true,
          reason: `${alternateSlot.label} overflow`,
          category: primaryAssignment.category
        });

        console.log(`   ☕ ${staffName} (${unit}): ${alternateSlot.start}-${actualEndTime} [Overflow]`);
      }
    }

    console.log(`\n🎢 Assigning ${ridesBreaksToAssign.length} rides breaks (staggered from 11:00)...`);
    let currentBreakStart = 11 * 60;

    for (const rider of ridesBreaksToAssign) {
      const breakEnd = currentBreakStart + rider.breakMinutes;
      breakAssignments.push({
        unit: rider.unit,
        position: 'BREAK',
        staff: rider.staffName,
        startTime: minutesToTime(currentBreakStart),
        endTime: minutesToTime(breakEnd),
        startMinutes: currentBreakStart,
        endMinutes: breakEnd,
        isBreak: true,
        reason: 'Staggered',
        category: 'Rides'
      });

      console.log(`  ☕ ${rider.staffName} (${rider.unit}): ${minutesToTime(currentBreakStart)}-${minutesToTime(breakEnd)}`);
      currentBreakStart = breakEnd;
    }

    console.log(`\n📊 Break Distribution:`);
    for (const slot of breakSlots) {
      console.log(`   ${slot.start}: ${slot.assigned.length}/${slot.capacity} staff`);
    }

    return breakAssignments;
  }

  function splitAssignmentsAroundBreaks(regularAssignments, breakAssignments) {
    const result = [];

    for (const assignment of regularAssignments) {
      if (assignment.isBreak) {
        result.push(assignment);
        continue;
      }

      const breaksForStaff = breakAssignments.filter((breakAssignment) =>
        breakAssignment.staff === assignment.staff &&
        timeToMinutes(assignment.startTime) < breakAssignment.endMinutes &&
        breakAssignment.startMinutes < timeToMinutes(assignment.endTime)
      );

      if (breaksForStaff.length === 0) {
        result.push(assignment);
        continue;
      }

      let currentStart = timeToMinutes(assignment.startTime);
      for (const breakSlot of breaksForStaff.sort((left, right) => left.startMinutes - right.startMinutes)) {
        if (currentStart < breakSlot.startMinutes) {
          result.push({
            ...assignment,
            startTime: minutesToTime(currentStart),
            endTime: minutesToTime(breakSlot.startMinutes)
          });
        }

        result.push(breakSlot);
        currentStart = breakSlot.endMinutes;
      }

      const assignmentEnd = timeToMinutes(assignment.endTime);
      if (currentStart < assignmentEnd) {
        result.push({
          ...assignment,
          startTime: minutesToTime(currentStart),
          endTime: assignment.endTime
        });
      }
    }

    return result;
  }

  function findBreakCover(breakAssignments, lateArrivals, assignedStaff, timegripData, skillsData, zone, dayCode) {
    const breakCoverAssignments = [];
    const usedLateArrivals = new Set();
    let covered = 0;
    let uncovered = 0;

    const admissionsBreaks = breakAssignments.filter((breakAssignment) =>
      breakAssignment.unit.toLowerCase().includes('lodge') ||
      breakAssignment.unit.toLowerCase().includes('entrance') ||
      breakAssignment.unit.toLowerCase().includes('admissions')
    );

    const retailBreaks = breakAssignments.filter((breakAssignment) => !admissionsBreaks.includes(breakAssignment));
    const ridesBreaks = breakAssignments.filter((breakAssignment) =>
      breakAssignment.position?.includes('Operator') ||
      breakAssignment.position?.includes('Attendant') ||
      breakAssignment.unit?.match(/Adventure Tree|Vampire|Gruffalo|Griffin|Sea Dragons|Tiny Truckers|Dragon's/i)
    );
    const nonRidesRetailBreaks = retailBreaks.filter((breakAssignment) => !ridesBreaks.includes(breakAssignment));

    console.log(`\n🎢 Processing ${ridesBreaks.length} rides breaks with cascading coverage...`);
    const sortedRidesBreaks = ridesBreaks.sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));

    let previousOperator = null;
    let previousOperatorReturnTime = null;

    for (let index = 0; index < sortedRidesBreaks.length; index++) {
      const breakNeeded = sortedRidesBreaks[index];
      const breakStart = timeToMinutes(breakNeeded.startTime);
      const breakEnd = timeToMinutes(breakNeeded.endTime);

      if (index === 0) {
        const bcOperator = lateArrivals.find((lateArrival) => {
          const lowerFunc = (lateArrival.plannedFunction || lateArrival.scheduledFunction || '').toLowerCase();
          return lowerFunc.includes('break cover') && lowerFunc.includes('ride');
        });

        if (bcOperator && !usedLateArrivals.has(bcOperator.name)) {
          const trainedUnits = getStaffTrainedUnits(bcOperator);
          const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const canCover = trainedUnits.some((trainedUnit) => {
            const trainedNorm = trainedUnit.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            const unitMatches = trainedNorm.includes(breakUnitNorm) || breakUnitNorm.includes(trainedNorm);
            const positionMatches =
              (breakNeeded.position?.includes('Operator') && trainedUnit.skillType?.includes('OP')) ||
              (breakNeeded.position?.includes('Attendant') && trainedUnit.skillType?.includes('ATT'));
            return unitMatches && positionMatches;
          });

          if (canCover) {
            lateArrivals.push({
              staff: bcOperator.name,
              unit: breakNeeded.unit,
              position: breakNeeded.position,
              startTime: breakNeeded.startTime,
              endTime: breakNeeded.endTime,
              reason: 'BC covers first break'
            });
            usedLateArrivals.add(bcOperator.name);
            console.log(`  ✅ ${bcOperator.name} (BC) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
            previousOperator = breakNeeded.staff;
            previousOperatorReturnTime = breakEnd;
            continue;
          }
        }

        console.log(`  ⚠️  ${breakNeeded.unit}: No BC operator available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
        continue;
      }

      if (previousOperator && previousOperatorReturnTime && previousOperatorReturnTime <= breakStart) {
        const previousOpStaff = skillsData.staffWithGreen.find((staffMember) =>
          normalizeStaffName(staffMember.name) === normalizeStaffName(previousOperator)
        );

        if (previousOpStaff) {
          const trainedUnits = getStaffTrainedUnits(previousOpStaff);
          const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const canCover = trainedUnits.some((trainedUnit) => {
            const trainedNorm = trainedUnit.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            const unitMatches = trainedNorm.includes(breakUnitNorm) || breakUnitNorm.includes(trainedNorm);
            const positionMatches =
              (breakNeeded.position?.includes('Operator') && trainedUnit.skillType?.includes('OP')) ||
              (breakNeeded.position?.includes('Attendant') && trainedUnit.skillType?.includes('ATT'));
            return unitMatches && positionMatches;
          });

          if (canCover) {
            lateArrivals.push({
              staff: previousOperator,
              unit: breakNeeded.unit,
              position: breakNeeded.position,
              startTime: breakNeeded.startTime,
              endTime: breakNeeded.endTime,
              reason: 'Cascading coverage'
            });
            console.log(`  ✅ ${previousOperator} (returned from break) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
            previousOperator = breakNeeded.staff;
            previousOperatorReturnTime = breakEnd;
            continue;
          }
        }
      }

      console.log(`  ⚠️  ${breakNeeded.unit}: No cascading cover available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
    }

    console.log(`\n🔑 Checking for uncovered rides breaks...`);
    const uncoveredRidesBreaks = [];
    for (const breakNeeded of sortedRidesBreaks) {
      const hasCoverage = lateArrivals.some((lateArrival) =>
        lateArrival.staff !== breakNeeded.staff &&
        lateArrival.unit === breakNeeded.unit &&
        lateArrival.startTime === breakNeeded.startTime &&
        lateArrival.endTime === breakNeeded.endTime
      );

      if (!hasCoverage) {
        uncoveredRidesBreaks.push(breakNeeded);
      }
    }

    if (uncoveredRidesBreaks.length > 0) {
      console.log(`   Found ${uncoveredRidesBreaks.length} uncovered rides breaks`);
      const zonalLeadStaff = timegripData.staffByFunction?.MANAGEMENT || [];
      const usedZonalLeads = new Set();

      for (const breakNeeded of uncoveredRidesBreaks) {
        const availableLead = zonalLeadStaff.find((lead) => !usedZonalLeads.has(lead.name) && !usedLateArrivals.has(lead.name));
        if (!availableLead) {
          console.log(`   ⚠️  No available Zonal Lead for ${breakNeeded.unit} break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
          continue;
        }

        const trainedUnits = getStaffTrainedUnits(availableLead);
        const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
        const canCover = trainedUnits.some((trainedUnit) => {
          const trainedNorm = trainedUnit.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const unitMatches = trainedNorm.includes(breakUnitNorm) || breakUnitNorm.includes(trainedNorm);
          const positionMatches =
            (breakNeeded.position?.includes('Operator') && trainedUnit.skillType?.includes('OP')) ||
            (breakNeeded.position?.includes('Attendant') && trainedUnit.skillType?.includes('ATT'));
          return unitMatches && positionMatches;
        });

        if (!canCover) {
          console.log(`   ⚠️  ${availableLead.name} doesn't have skill for ${breakNeeded.unit}`);
          continue;
        }

        lateArrivals.push({
          staff: availableLead.name,
          unit: breakNeeded.unit,
          position: breakNeeded.position,
          startTime: breakNeeded.startTime,
          endTime: breakNeeded.endTime,
          reason: 'Zonal Lead covers break'
        });
        usedZonalLeads.add(availableLead.name);
        console.log(`   ✅ ${availableLead.name} (Zonal Lead) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
      }
    } else {
      console.log(`   ✅ All rides breaks are covered!`);
    }

    for (const breakNeeded of admissionsBreaks) {
      let foundCover = false;

      for (const lateArrival of lateArrivals) {
        if (usedLateArrivals.has(lateArrival.name) || assignedStaff.has(lateArrival.name)) {
          continue;
        }

        const trainedUnits = getStaffTrainedUnits(lateArrival);
        const matchingSkill = trainedUnits.find((trainedUnit) => trainedUnit.unit.toLowerCase().includes('admissions'));
        if (!matchingSkill) {
          continue;
        }

        const lateWorkingHours = getStaffWorkingHours(lateArrival.name, timegripData);
        if (!lateWorkingHours) {
          continue;
        }

        const breakStart = timeToMinutes(breakNeeded.startTime);
        const breakEnd = timeToMinutes(breakNeeded.endTime);
        const workerStart = timeToMinutes(lateWorkingHours.startTime);
        const workerEnd = timeToMinutes(lateWorkingHours.endTime);
        if (breakStart < workerStart || breakEnd > workerEnd) {
          continue;
        }

        const normalizedSearchName = normalizeStaffName(lateArrival.name);
        const timegripStaff = timegripData.workingStaff.find((staffMember) => normalizeStaffName(staffMember.name) === normalizedSearchName);
        const staffDisplayName = timegripStaff ? timegripStaff.name : lateArrival.name;

        if (breakStart > workerStart) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: lateWorkingHours.startTime,
            endTime: breakNeeded.startTime,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: `${breakNeeded.unit} Break Cover`,
          staff: staffDisplayName,
          startTime: breakNeeded.startTime,
          endTime: breakNeeded.endTime,
          isBreak: false,
          isBreakCover: true,
          trainingMatch: matchingSkill.fullSkill,
          zone,
          dayCode,
          positionType: matchingSkill.skillType
        });

        const personalBreakStart = workerStart + (3 * 60);
        const personalBreakTime = snapToNearestHour(personalBreakStart);

        if (breakEnd < personalBreakTime.startMin && personalBreakTime.startMin < workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: breakNeeded.endTime,
            endTime: personalBreakTime.start,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        if (personalBreakTime.startMin >= workerStart && personalBreakTime.endMin <= workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: `${breakNeeded.unit} Break`,
            staff: staffDisplayName,
            startTime: personalBreakTime.start,
            endTime: personalBreakTime.end,
            isBreak: true,
            isBreakCover: false,
            zone,
            dayCode
          });
          console.log(`     ✅ ${staffDisplayName} personal break: ${personalBreakTime.start}-${personalBreakTime.end}`);
        }

        if (personalBreakTime.endMin < workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: personalBreakTime.end,
            endTime: lateWorkingHours.endTime,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        usedLateArrivals.add(lateArrival.name);
        assignedStaff.add(lateArrival.name);
        console.log(`  ✅ ${staffDisplayName} → Admissions rotational (${breakNeeded.startTime}-${breakNeeded.endTime} break cover)`);
        covered++;
        foundCover = true;
        break;
      }

      if (!foundCover) {
        console.log(`  ⚠️  ${breakNeeded.staff} needs admissions break but NO cover available`);
        uncovered++;
      }
    }

    console.log(`\n🛍️ Processing ${nonRidesRetailBreaks.length} retail/admissions breaks...`);
    for (const breakNeeded of nonRidesRetailBreaks) {
      let foundCover = false;

      for (const lateArrival of lateArrivals) {
        if (usedLateArrivals.has(lateArrival.name) || assignedStaff.has(lateArrival.name)) {
          continue;
        }
        if (!hasSkillForUnit(lateArrival.name, breakNeeded.unit, skillsData)) {
          continue;
        }

        const trainedUnits = getStaffTrainedUnits(lateArrival);
        const matchingSkill = trainedUnits.find((trainedUnit) => unitsMatchForBreakCover(trainedUnit.unit, breakNeeded.unit));
        if (!matchingSkill) {
          continue;
        }

        const lateWorkingHours = getStaffWorkingHours(lateArrival.name, timegripData);
        if (!lateWorkingHours) {
          continue;
        }

        const breakStart = timeToMinutes(breakNeeded.startTime);
        const breakEnd = timeToMinutes(breakNeeded.endTime);
        const workerStart = timeToMinutes(lateWorkingHours.startTime);
        const workerEnd = timeToMinutes(lateWorkingHours.endTime);
        if (breakStart < workerStart || breakEnd > workerEnd) {
          continue;
        }

        const normalizedSearchName = normalizeStaffName(lateArrival.name);
        const timegripStaff = timegripData.workingStaff.find((staffMember) => normalizeStaffName(staffMember.name) === normalizedSearchName);
        const staffDisplayName = timegripStaff ? timegripStaff.name : lateArrival.name;

        if (breakStart > workerStart) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: lateWorkingHours.startTime,
            endTime: breakNeeded.startTime,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: `${breakNeeded.unit} Break Cover`,
          staff: staffDisplayName,
          startTime: breakNeeded.startTime,
          endTime: breakNeeded.endTime,
          isBreak: false,
          isBreakCover: true,
          trainingMatch: matchingSkill.fullSkill,
          zone,
          dayCode,
          positionType: matchingSkill.skillType
        });

        const personalBreakStart = workerStart + (3 * 60);
        const personalBreakTime = snapToNearestHour(personalBreakStart);

        if (breakEnd < personalBreakTime.startMin && personalBreakTime.startMin < workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: breakNeeded.endTime,
            endTime: personalBreakTime.start,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        if (personalBreakTime.startMin >= workerStart && personalBreakTime.endMin <= workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: `${breakNeeded.unit} Break`,
            staff: staffDisplayName,
            startTime: personalBreakTime.start,
            endTime: personalBreakTime.end,
            isBreak: true,
            isBreakCover: false,
            zone,
            dayCode
          });
          console.log(`     ✅ ${staffDisplayName} personal break: ${personalBreakTime.start}-${personalBreakTime.end}`);
        }

        if (personalBreakTime.endMin < workerEnd) {
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: getPositionForUnit(breakNeeded.unit),
            staff: staffDisplayName,
            startTime: personalBreakTime.end,
            endTime: lateWorkingHours.endTime,
            isBreak: false,
            isBreakCover: false,
            zone,
            dayCode
          });
        }

        usedLateArrivals.add(lateArrival.name);
        assignedStaff.add(lateArrival.name);
        console.log(`  ✅ ${staffDisplayName} → ${breakNeeded.unit} rotational (${breakNeeded.startTime}-${breakNeeded.endTime} break cover)`);
        covered++;
        foundCover = true;
        break;
      }

      if (!foundCover) {
        uncovered++;
      }
    }

    return { assignments: breakCoverAssignments, covered, uncovered, total: breakAssignments.length };
  }

  return {
    assignSmartBreakCover,
    calculateAllBreaksNeeded,
    findBreakCover,
    splitAssignmentsAroundBreaks,
    staggerBreaksByUnit
  };
}

module.exports = { createBreakPlanningHelpers };