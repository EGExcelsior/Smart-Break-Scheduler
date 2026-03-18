'use strict';

function normalizeStaffKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toMinute(timeToMinutes, value, fallback = 0) {
  if (!value) return fallback;
  try {
    return timeToMinutes(value);
  } catch {
    return fallback;
  }
}

function selectPrimaryUnitByStaff(assignments, timeToMinutes) {
  const map = new Map();
  const primaryMinute = timeToMinutes('14:00');

  const productive = assignments.filter((assignment) =>
    assignment &&
    assignment.staff &&
    assignment.staff !== 'UNFILLED' &&
    !assignment.isBreak &&
    assignment.unit
  );

  for (const assignment of productive) {
    const staffKey = normalizeStaffKey(assignment.staff);
    const start = toMinute(timeToMinutes, assignment.startTime, 0);
    const end = toMinute(timeToMinutes, assignment.endTime, 0);

    if (start <= primaryMinute && end > primaryMinute) {
      map.set(staffKey, assignment.unit);
    }
  }

  for (const assignment of productive) {
    const staffKey = normalizeStaffKey(assignment.staff);
    if (map.has(staffKey)) {
      continue;
    }

    const existing = map.get(staffKey);
    if (!existing) {
      map.set(staffKey, assignment.unit);
    }
  }

  return map;
}

function countByUnitAtMinute(assignments, minuteMark, timeToMinutes) {
  const counts = new Map();

  for (const assignment of assignments) {
    if (!assignment || !assignment.unit || assignment.isBreak || assignment.staff === 'UNFILLED') {
      continue;
    }

    const start = toMinute(timeToMinutes, assignment.startTime, 0);
    const end = toMinute(timeToMinutes, assignment.endTime, 0);
    if (start <= minuteMark && end > minuteMark) {
      counts.set(assignment.unit, (counts.get(assignment.unit) || 0) + 1);
    }
  }

  return counts;
}

function buildScenarioDelta({
  baselineAssignments = [],
  currentAssignments = [],
  forcedAbsentStaff = [],
  timeToMinutes
}) {
  if (!Array.isArray(baselineAssignments) || baselineAssignments.length === 0) {
    return null;
  }

  const absentSet = new Set((forcedAbsentStaff || []).map(normalizeStaffKey));
  const baselinePrimary = selectPrimaryUnitByStaff(baselineAssignments, timeToMinutes);
  const currentPrimary = selectPrimaryUnitByStaff(currentAssignments, timeToMinutes);

  let movedNonAbsentCount = 0;
  for (const [staffKey, baselineUnit] of baselinePrimary.entries()) {
    if (absentSet.has(staffKey)) {
      continue;
    }

    const currentUnit = currentPrimary.get(staffKey);
    if (currentUnit && currentUnit !== baselineUnit) {
      movedNonAbsentCount += 1;
    }
  }

  const impactedUnits = new Set();
  for (const assignment of baselineAssignments) {
    if (!assignment || !assignment.staff || !assignment.unit || assignment.isBreak || assignment.staff === 'UNFILLED') {
      continue;
    }

    if (absentSet.has(normalizeStaffKey(assignment.staff))) {
      impactedUnits.add(assignment.unit);
    }
  }

  const minute1400 = timeToMinutes('14:00');
  const baselineCoverage = countByUnitAtMinute(baselineAssignments, minute1400, timeToMinutes);
  const currentCoverage = countByUnitAtMinute(currentAssignments, minute1400, timeToMinutes);
  const coverageDiff = [];

  const allUnits = new Set([...baselineCoverage.keys(), ...currentCoverage.keys()]);
  for (const unitName of allUnits) {
    const before = baselineCoverage.get(unitName) || 0;
    const after = currentCoverage.get(unitName) || 0;
    if (before !== after) {
      coverageDiff.push({ unit: unitName, before, after, delta: after - before });
    }
  }

  coverageDiff.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));

  return {
    absentStaffCount: absentSet.size,
    impactedUnits: Array.from(impactedUnits),
    movedNonAbsentCount,
    coverageDiffAt1400: coverageDiff.slice(0, 10)
  };
}

module.exports = {
  buildScenarioDelta
};
