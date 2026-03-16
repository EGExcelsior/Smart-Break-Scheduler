const { createBreakPlanningHelpers } = require('./breakPlanningHelpers');
const { getStaffWorkingHours } = require('../../utils/staffTimegripUtils');

/**
 * PASS 0 (V11 REVISED): Calculate Breaks & Find Late Arrival Coverage
 * 
 * Runs AFTER passes 1-3 so all staff assignments are complete
 * 
 * Performs:
 * - Calculate mandatory break times for all assigned staff
 * - Find late arrivals (≥10:00 start) to provide break coverage
 * - Match breaks to late arrivals
 * - Use Zonal Leads for uncovered breaks
 * - Apply smart break cover assignments
 * - Stagger breaks by unit
 * - Split assignments around staggered breaks
 */

function scheduleBreaksWithCoverage({
  assignments,
  timegripData,
  skillsData,
  assignedStaff,
  zone,
  dayCode,
  canonicalizeUnitName,
  getCategoryFromUnit,
  hasSkillForUnit,
  getStaffTrainedUnits
}) {
  const {
    assignSmartBreakCover,
    calculateAllBreaksNeeded,
    findBreakCover,
    splitAssignmentsAroundBreaks,
    staggerBreaksByUnit
  } = createBreakPlanningHelpers({
    canonicalizeUnitName,
    getCategoryFromUnit,
    hasSkillForUnit,
    getStaffTrainedUnits
  });

  console.log('\nðŸ"‹ PASS 0 (V11): Calculate Break Times & Find Late Arrival Coverage');
  
  // Step 1: Calculate all breaks needed
  console.log('\nðŸ• Calculating mandatory break times for assigned staff...');
  const breaksNeeded = calculateAllBreaksNeeded(assignments, timegripData);
  console.log(`   Found ${breaksNeeded.length} breaks to schedule\n`);
  
  if (breaksNeeded.length > 0) {
    for (const br of breaksNeeded.slice(0, 10)) {
      console.log(`  â˜• ${br.staff} (${br.unit}): ${br.startTime}-${br.endTime}`);
    }
    if (breaksNeeded.length > 10) {
      console.log(`  ... and ${breaksNeeded.length - 10} more`);
    }
  }
  
  // Step 2: Find late arrivals
  console.log(`\nðŸ"„ Matching late arrivals (â‰¥10:00) to provide break coverage...`);
  const lateArrivals = skillsData.staffWithGreen.filter(staff => {
    if (assignedStaff.has(staff.name)) return false;
    const workingHours = getStaffWorkingHours(staff.name, timegripData);
    if (!workingHours) return false;
    const [startHour] = workingHours.startTime.split(':').map(Number);
    return startHour >= 10;
  });
  
  console.log(`   Found ${lateArrivals.length} late arrivals available\n`);
  
  // Step 3: Match late arrivals to breaks
  const breakCoverResult = findBreakCover(breaksNeeded, lateArrivals, assignedStaff, timegripData, skillsData, zone, dayCode);
  const breakCoverAssignments = breakCoverResult.assignments;
  
  console.log(`\nâœ… Break coverage results:`);
  console.log(`   ${breakCoverResult.covered}/${breakCoverResult.total} breaks covered by late arrivals`);
  if (breakCoverResult.uncovered > 0) {
    console.log(`   âš ï¸  ${breakCoverResult.uncovered} breaks without coverage`);
  }
  
  // âœ… FIX: Use Zonal Leads to cover uncovered retail/admissions breaks
  if (breakCoverResult.uncovered > 0) {
    console.log(`\nðŸ"' Attempting to use Zonal Leads for uncovered breaks...`);
    const zonalLeadStaffForBreaks = timegripData.staffByFunction?.MANAGEMENT || [];
    const usedZonalLeadsForBreaks = new Set();
    let zonalLeadsCovered = 0;
    
    for (const breakNeeded of breaksNeeded) {
      // Check if already covered
      const alreadyCovered = breakCoverAssignments.some(bc => 
        bc.unit === breakNeeded.unit &&
        bc.startTime === breakNeeded.startTime &&
        bc.endTime === breakNeeded.endTime
      );
      
      if (alreadyCovered) continue;
      
      // Find available Zonal Lead with matching skill
      const availableLead = zonalLeadStaffForBreaks.find(lead => {
        if (usedZonalLeadsForBreaks.has(lead.name)) return false;
        
        const trainedUnits = getStaffTrainedUnits(lead);
        const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
        
        return trainedUnits.some(tu => {
          const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          return tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
        });
      });
      
      if (availableLead) {
        const trainedUnits = getStaffTrainedUnits(availableLead);
        const matchingSkill = trainedUnits.find(tu => {
          const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          return tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
        });
        
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: breakNeeded.position,
          staff: availableLead.name,
          startTime: breakNeeded.startTime,
          endTime: breakNeeded.endTime,
          isBreak: false,
          isBreakCover: true,
          trainingMatch: matchingSkill?.fullSkill || `${breakNeeded.unit}-HOST`,
          zone: zone,
          dayCode: dayCode,
          positionType: 'Zonal Lead (Break Cover)'
        });
        
        usedZonalLeadsForBreaks.add(availableLead.name);
        zonalLeadsCovered++;
        console.log(`   âœ… ${availableLead.name} (Zonal Lead) â†' ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime})`);
      }
    }
    
    if (zonalLeadsCovered > 0) {
      console.log(`   âœ… Zonal Leads covered ${zonalLeadsCovered} additional breaks`);
    } else {
      console.log(`   âš ï¸  No available Zonal Leads with matching skills`);
    }
  }
  
  // âœ… FIX #9: Smart break cover assignment to specific units during specific breaks
  // âœ… FIX: Check BOTH plannedFunction and scheduledFunction for BC staff
  // BC staff have their function in scheduledFunction, not plannedFunction
  const availableBreakCoverStaff = timegripData.workingStaff.filter(s => {
    const funcType = s.plannedFunction || s.scheduledFunction || '';
    return funcType.includes('Break Cover');
  });
  const smartBreakCoverAssignments = assignSmartBreakCover(assignments, breaksNeeded, availableBreakCoverStaff, timegripData, skillsData);
  
  // âœ… FIX #6: Stagger breaks BEFORE splitting to avoid gaps
  // Calculate staggered breaks first (e.g., 11:00 â†' 12:00)
  console.log(`\nðŸ"„ Applying Break Staggering Logic...`);
  const staggerResult = staggerBreaksByUnit(assignments);
  const staggeredBreakMap = new Map();
  
  // Build map of staggered breaks from the stagger result
  for (const assignment of staggerResult) {
    if (assignment.isBreak && assignment.staff && !staggeredBreakMap.has(assignment.staff)) {
      staggeredBreakMap.set(assignment.staff, {
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        unit: assignment.unit
      });
    }
  }
  
  // Step 4: Update breaks with staggered times BEFORE splitting
  let finalBreaksToSplit = breaksNeeded.map(br => {
    if (staggeredBreakMap.has(br.staff)) {
      const staggered = staggeredBreakMap.get(br.staff);
      return {
        ...br,
        startTime: staggered.startTime,
        endTime: staggered.endTime
      };
    }
    return br;
  });
  
  // Show staggered breaks
  if (staggeredBreakMap.size > 0) {
    for (const [staff, staggered] of staggeredBreakMap) {
      const original = breaksNeeded.find(b => b.staff === staff);
      if (original && original.startTime !== staggered.startTime) {
        console.log(`  ðŸ"„ ${staff} (${staggered.unit}): ${original.startTime}-${original.endTime} â†' ${staggered.startTime}-${staggered.endTime}`);
      }
    }
  }
  
  // Step 5: Split assignments around STAGGERED breaks
  const splitAndCoveredAssignments = [
    ...splitAssignmentsAroundBreaks(assignments, finalBreaksToSplit),
    ...breakCoverAssignments,
    ...smartBreakCoverAssignments  // âœ… FIX #9: Add smart break cover assignments
  ];

  return {
    splitAndCoveredAssignments,
    breakCoverAssignments,
    staggeredBreakMap,
    finalBreaksToSplit
  };
}

module.exports = { scheduleBreaksWithCoverage };
