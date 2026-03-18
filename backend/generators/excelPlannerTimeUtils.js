function generateTimeSlots(startTime, endTime, intervalMinutes = 15) {
  const slots = [];
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);

  let currentMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  while (currentMinutes <= endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
    currentMinutes += intervalMinutes;
  }

  return slots;
}

function getAssignmentRange(assignments) {
  let earliestStart = '23:59';
  let latestEnd = '00:00';

  for (const assignment of assignments) {
    if (assignment.startTime < earliestStart) earliestStart = assignment.startTime;
    if (assignment.endTime > latestEnd) latestEnd = assignment.endTime;
  }

  if (earliestStart === '23:59') earliestStart = '08:30';
  if (latestEnd === '00:00') latestEnd = '19:45';

  return { earliestStart, latestEnd };
}

function collectSignificantTimes(assignments, staffList) {
  const significantTimesSet = new Set();
  const addMinutesToTime = (time, minutesToAdd) => {
    const [hour, minute] = String(time || '00:00').split(':').map(Number);
    const total = (hour * 60) + minute + minutesToAdd;
    const safeTotal = Math.max(0, total);
    const outHour = Math.floor(safeTotal / 60);
    const outMinute = safeTotal % 60;
    return `${outHour.toString().padStart(2, '0')}:${outMinute.toString().padStart(2, '0')}`;
  };

  for (const assignment of assignments) {
    if (assignment.startTime) significantTimesSet.add(assignment.startTime);
    if (assignment.endTime) significantTimesSet.add(assignment.endTime);
    if (assignment.breakStart) significantTimesSet.add(assignment.breakStart);
    if (assignment.breakEnd) significantTimesSet.add(assignment.breakEnd);
  }

  for (const staff of staffList) {
    if (staff.startTime) significantTimesSet.add(staff.startTime);
    if (staff.endTime) significantTimesSet.add(staff.endTime);
  }

  const briefingStarts = ['08:30', '09:15', '11:00'];
  for (const briefingStart of briefingStarts) {
    significantTimesSet.add(briefingStart);
    significantTimesSet.add(addMinutesToTime(briefingStart, 15));
  }

  return significantTimesSet;
}

function buildSignificantTimeSlots(assignments, staffList) {
  const { earliestStart, latestEnd } = getAssignmentRange(assignments);
  const significantTimesSet = collectSignificantTimes(assignments, staffList);
  const allPossibleSlots = generateTimeSlots(earliestStart, latestEnd, 15);

  return allPossibleSlots.filter((slot) => significantTimesSet.has(slot));
}

module.exports = {
  generateTimeSlots,
  buildSignificantTimeSlots
};
