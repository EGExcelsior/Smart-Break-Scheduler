/**
 * Enforce assignment for staff who CANNOT be left alone (FIX #7)
 * 
 * These special staff must have a position assigned, never left unassigned.
 * If not already assigned during passes 1-5, force-assign to any available position.
 */

function enforceSpecialStaffAssignment({
  STAFF_CANNOT_BE_LEFT_ALONE,
  skillsData,
  teamName,
  assignedStaff,
  assignments,
  staffingRequirements,
  filledPositions,
  timegripData,
  normalizeStaffName,
  zone,
  dayCode
}) {
  console.log('\nðŸ"‹ FIX #7: Enforce Assignment for Special Staff (Cannot Be Left Alone)');
  
  let assignedCount = 0;

  for (const specialStaff of STAFF_CANNOT_BE_LEFT_ALONE) {
    // âœ… FIX #5b: Only force-assign if this person exists in CURRENT ZONE's Skills Matrix
    const existsInThisZone = skillsData.staffWithGreen.some(s => 
      normalizeStaffName(s.name) === normalizeStaffName(specialStaff)
    );
    
    if (!existsInThisZone) {
      console.log(`  â­ï¸  ${specialStaff}: Not in ${teamName} Skills Matrix - skipping`);
      continue;
    }
    
    if (assignedStaff.has(specialStaff)) {
      // Already assigned, all good
      const assigned_obj = assignments.find(a => a.staff === specialStaff);
      if (assigned_obj) {
        console.log(`  âœ… ${specialStaff}: Already assigned to ${assigned_obj.unit}`);
      }
      continue;
    }
    
    // Special staff is NOT assigned - MUST find a position for them
    console.log(`  ðŸš¨ ${specialStaff}: NOT ASSIGNED - Finding any available position...`);
    
    // Get ANY position that still needs staff (not full)
    const anyAvailable = staffingRequirements.find(req => 
      (filledPositions.get(req.position) || 0) < req.staffNeeded &&
      !req.position.toLowerCase().includes('break cover')
    );
    
    if (anyAvailable) {
      // Find their working hours
      const timegripStaff = timegripData.workingStaff.find(s => 
        normalizeStaffName(s.name) === normalizeStaffName(specialStaff)
      );
      
      const workingHours = timegripStaff ? {
        startTime: timegripStaff.startTime,
        endTime: timegripStaff.endTime,
        breakMinutes: timegripStaff.scheduledBreakMinutes || 0
      } : { startTime: '08:00', endTime: '16:00', breakMinutes: 30 };
      
      assignments.push({
        unit: anyAvailable.unitName,
        position: anyAvailable.position,
        positionType: 'SPECIAL ASSIGNMENT (Cannot Be Left Alone)',
        staff: specialStaff,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: `${anyAvailable.unitName}-Special`,
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        breakMinutes: workingHours.breakMinutes,
        isBreak: false
      });
      
      assignedStaff.add(specialStaff);
      filledPositions.set(anyAvailable.position, (filledPositions.get(anyAvailable.position) || 0) + 1);
      console.log(`  âœ… ${specialStaff} â†' ${anyAvailable.unitName} (${anyAvailable.position}) [FORCED ASSIGNMENT]`);
      assignedCount++;
    } else {
      console.log(`  âŒ ${specialStaff}: NO AVAILABLE POSITIONS - CRITICAL ERROR, cannot be left unassigned`);
    }
  }

  return { assignedCount };
}

module.exports = { enforceSpecialStaffAssignment };
