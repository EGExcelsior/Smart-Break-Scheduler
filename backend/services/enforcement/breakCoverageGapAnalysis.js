'use strict';

/**
 * STEP 5d: Smart Break Coverage Analysis
 *
 * Analyzes coverage gaps during operating hours and assigns break cover staff
 * to fill them, creating balance across retail units.
 *
 * @param {object} options
 * @param {Array}  options.assignments           - mutated in place (breaks added)
 * @param {Array}  options.breakCoverStaffAssignments  - break cover staff available
 * @param {Function} options.timeToMinutes
 * @param {Function} options.minutesToTime
 * @param {string} options.zone
 * @param {string} options.dayCode
 * @returns {{ coverage: Map, gaps: Array, rotations: Array, assignedCount: number }}
 */
function analyzeBreakCoverageSmart({
  assignments,
  breakCoverStaffAssignments,
  timeToMinutes,
  minutesToTime,
  zone,
  dayCode
}) {
  console.log('\n📊 Analyzing break coverage needs...');

  // Step 1: Build coverage map - who's working where, when
  const coverageMap = new Map(); // unit -> time slot -> count

  for (const assignment of assignments) {
    if (assignment.isBreak || assignment.unit === 'Zonal Lead') continue;

    const unit = assignment.unit;
    const startMin = timeToMinutes(assignment.startTime);
    const endMin = timeToMinutes(assignment.endTime);

    // Create 15-minute slots from 10:00 to 17:00
    for (let time = 600; time < 1020; time += 15) {
      if (time >= startMin && time < endMin) {
        const timeKey = `${unit}-${minutesToTime(time)}`;
        if (!coverageMap.has(timeKey)) {
          coverageMap.set(timeKey, new Set());
        }
        coverageMap.get(timeKey).add(assignment.staff);
      }
    }
  }

  // Step 2: Identify coverage gaps (units dropping below minimum)
  const coverageGaps = [];

  const MINIMUM_STAFF_REQUIRED = {
    'Lodge Entrance': 2,
    'Explorer Entrance': 2,
    'Adventure Point Gift Shop': 2,
    'Sweet Shop': 2,
    'Sealife': 1,
    'Lorikeets': 1,
    "Ben & Jerry's": 1,
    'Explorer Supplies': 1
  };

  for (const [unitTimeKey, staffSet] of coverageMap.entries()) {
    const [unit, timeSlot] = unitTimeKey.split('-');
    const minimumRequired = MINIMUM_STAFF_REQUIRED[unit];

    if (!minimumRequired) continue;

    if (staffSet.size < minimumRequired) {
      coverageGaps.push({
        unit,
        timeSlot,
        currentStaff: staffSet.size,
        requiredStaff: minimumRequired,
        gap: minimumRequired - staffSet.size
      });
    }
  }

  console.log(`   Found ${coverageGaps.length} coverage gaps`);

  if (coverageGaps.length > 0) {
    // Show sample gaps
    const sampleGaps = coverageGaps.slice(0, 5);
    for (const gap of sampleGaps) {
      console.log(`   ⚠️  ${gap.unit} at ${gap.timeSlot}: ${gap.currentStaff}/${gap.requiredStaff} staff (need ${gap.gap} more)`);
    }
    if (coverageGaps.length > 5) {
      console.log(`   ... and ${coverageGaps.length - 5} more gaps`);
    }
  }

  // Step 3: Use break cover staff to fill gaps
  console.log('\n🔄 Assigning break cover to fill gaps...');

  const breakCoverStaffAvailable = breakCoverStaffAssignments.filter(a =>
    a.isBreakCover &&
    timeToMinutes(a.startTime) <= 600 &&
    timeToMinutes(a.endTime) >= 1020
  );

  console.log(`   Available break cover staff: ${breakCoverStaffAvailable.length}`);

  // Organize gaps by time slot
  const gapsByTimeSlot = {};
  for (const gap of coverageGaps) {
    if (!gapsByTimeSlot[gap.timeSlot]) {
      gapsByTimeSlot[gap.timeSlot] = [];
    }
    gapsByTimeSlot[gap.timeSlot].push(gap);
  }

  const breakCoverRotations = [];
  let bcIndex = 0;

  const bcWindowStart = breakCoverStaffAvailable.length > 0
    ? Math.min(...breakCoverStaffAvailable.map((a) => timeToMinutes(a.startTime)))
    : null;
  const bcWindowEnd = breakCoverStaffAvailable.length > 0
    ? Math.max(...breakCoverStaffAvailable.map((a) => timeToMinutes(a.endTime)))
    : null;

  for (const [timeSlot, gaps] of Object.entries(gapsByTimeSlot)) {
    const slotStart = timeToMinutes(timeSlot);
    if (bcWindowStart !== null && bcWindowEnd !== null && (slotStart < bcWindowStart || slotStart >= bcWindowEnd)) {
      continue;
    }

    for (const gap of gaps) {
      if (bcIndex >= breakCoverStaffAvailable.length) break;

      const bcStaff = breakCoverStaffAvailable[bcIndex % breakCoverStaffAvailable.length];

      breakCoverRotations.push({
        staff: bcStaff.staff,
        unit: gap.unit,
        startTime: timeSlot,
        endTime: minutesToTime(timeToMinutes(timeSlot) + 30), // 30-min coverage
        reason: `Coverage gap: ${gap.currentStaff}/${gap.requiredStaff} staff`
      });

      bcIndex++;
    }
  }

  console.log(`   Created ${breakCoverRotations.length} break cover rotations`);

  // Add rotations to assignments
  for (const rotation of breakCoverRotations) {
    assignments.push({
      unit: rotation.unit,
      position: `${rotation.unit} - Break Cover`,
      staff: rotation.staff,
      startTime: rotation.startTime,
      endTime: rotation.endTime,
      isBreak: false,
      isBreakCover: true,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: 'Smart Break Cover',
      positionType: 'Break Cover (Gap Fill)'
    });

    console.log(`   ✅ ${rotation.staff} → ${rotation.unit} (${rotation.startTime}-${rotation.endTime})`);
  }

  return {
    coverage: coverageMap,
    gaps: coverageGaps,
    rotations: breakCoverRotations,
    assignedCount: breakCoverRotations.length
  };
}

module.exports = { analyzeBreakCoverageSmart };
