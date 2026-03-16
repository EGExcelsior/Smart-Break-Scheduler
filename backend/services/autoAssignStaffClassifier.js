function classifyDeferredRetailAdmissions(deferredRetailAdmissions, skillsData, normalizeStaffName, timeToMinutes) {
  const staffByType = {
    seniorHostsFullShift: [],
    regularHostsFullShift: [],
    regularHostsShortShift: [],
    regularHostsMidShift: []
  };

  for (const staff of deferredRetailAdmissions) {
    const isSeniorHost =
      (skillsData.seniorHosts && skillsData.seniorHosts.some((sh) =>
        normalizeStaffName(sh) === normalizeStaffName(staff.name)
      )) ||
      (staff.plannedFunction && staff.plannedFunction.includes('Senior Host'));

    const shiftStart = staff.startTime;
    const shiftEnd = staff.endTime;
    const shiftDuration = timeToMinutes(shiftEnd) - timeToMinutes(shiftStart);
    const breakMinutes = staff.scheduledBreakMinutes || 0;

    if (isSeniorHost && shiftStart === '09:15' && shiftDuration >= 420) {
      staffByType.seniorHostsFullShift.push(staff);
    } else if (!isSeniorHost && shiftStart === '09:15' && shiftDuration >= 420 && breakMinutes >= 30) {
      staffByType.regularHostsFullShift.push(staff);
    } else if (!isSeniorHost && shiftStart === '09:15' && shiftDuration < 300) {
      staffByType.regularHostsShortShift.push(staff);
    } else if (!isSeniorHost && shiftStart >= '10:00' && shiftDuration <= 300) {
      staffByType.regularHostsMidShift.push(staff);
    } else {
      if (isSeniorHost) {
        staffByType.seniorHostsFullShift.push(staff);
      } else {
        staffByType.regularHostsFullShift.push(staff);
      }
    }
  }

  return staffByType;
}

module.exports = {
  classifyDeferredRetailAdmissions
};
