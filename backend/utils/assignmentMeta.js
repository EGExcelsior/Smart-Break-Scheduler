function detectBriefingStaff(assignments = []) {
  const briefingTimesByStaff = new Map();
  const briefingStartTimes = new Set(['08:30', '09:15', '11:00']);

  for (const assignment of assignments) {
    if (!assignment || !assignment.staff) {
      continue;
    }

    if (briefingStartTimes.has(assignment.startTime) && !briefingTimesByStaff.has(assignment.staff)) {
      briefingTimesByStaff.set(assignment.staff, assignment.startTime);
    }
  }

  return briefingTimesByStaff;
}

module.exports = {
  detectBriefingStaff
};
