function detectBriefingStaff(assignments = []) {
  const briefingAttendees = new Set();

  for (const assignment of assignments) {
    if (assignment.startTime === '09:15') {
      briefingAttendees.add(assignment.staff);
    }
  }

  return briefingAttendees;
}

module.exports = {
  detectBriefingStaff
};
