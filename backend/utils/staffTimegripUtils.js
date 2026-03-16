/**
 * Staff/TimeGrip utility helpers shared across backend flows.
 */

function normalizeStaffName(name) {
  if (!name) return '';

  // Remove department suffixes and normalize whitespace.
  let normalized = name
    .toLowerCase()
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep first name + first surname for stable matching.
  const parts = normalized.split(' ');
  if (parts.length > 2) {
    normalized = `${parts[0]} ${parts[1]}`;
  }

  return normalized;
}

function isStaffAvailableForTime(staffName, startTime, endTime, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);

  // Search in both standard staff and MANAGEMENT (zonal leads).
  let staff = timegripData.workingStaff.find((s) => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });

  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find((s) => {
      const normalizedWorkingName = normalizeStaffName(s.name);
      return normalizedWorkingName === normalizedSearchName;
    });
  }

  if (!staff) {
    return false;
  }

  return true;
}

function getStaffWorkingHours(staffName, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);

  // Search in both standard staff and MANAGEMENT (zonal leads).
  let staff = timegripData.workingStaff.find((s) => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });

  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find((s) => {
      const normalizedWorkingName = normalizeStaffName(s.name);
      return normalizedWorkingName === normalizedSearchName;
    });
  }

  if (!staff) {
    return null;
  }

  return {
    startTime: staff.startTime,
    endTime: staff.endTime,
    breakMinutes: staff.scheduledBreakMinutes || 0
  };
}

module.exports = {
  normalizeStaffName,
  isStaffAvailableForTime,
  getStaffWorkingHours
};
