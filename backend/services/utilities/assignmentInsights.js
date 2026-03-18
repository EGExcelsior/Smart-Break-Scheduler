'use strict';

function buildQuarterHourSlots(earliestStart, latestEnd) {
  const slots = [];

  let cursor = earliestStart;
  while (cursor + 15 <= latestEnd) {
    slots.push(cursor);
    cursor += 15;
  }

  return slots;
}

function minutesToTime(minutes) {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function buildBusiestWindow(assignments, earliestStart, latestEnd, timeToMinutes) {
  const slots = buildQuarterHourSlots(earliestStart, latestEnd);
  if (slots.length === 0) {
    return null;
  }

  const activeAtSlot = (slotStart) => assignments.filter((assignment) => {
    const start = timeToMinutes(assignment.startTime);
    const end = timeToMinutes(assignment.endTime);
    return start <= slotStart && end > slotStart;
  }).length;

  const twoHourWindow = 120;
  const quarterHoursInWindow = twoHourWindow / 15;

  let bestWindow = null;
  for (let index = 0; index <= slots.length - quarterHoursInWindow; index++) {
    const windowStart = slots[index];
    const windowEnd = windowStart + twoHourWindow;
    const sampleSlots = slots.slice(index, index + quarterHoursInWindow);
    const totalCoverage = sampleSlots.reduce((sum, slot) => sum + activeAtSlot(slot), 0);

    if (!bestWindow || totalCoverage > bestWindow.totalCoverage) {
      bestWindow = { windowStart, windowEnd, totalCoverage };
    }
  }

  if (!bestWindow) {
    const fallbackStart = slots[0];
    return {
      startTime: minutesToTime(fallbackStart),
      endTime: minutesToTime(fallbackStart + 60)
    };
  }

  return {
    startTime: minutesToTime(bestWindow.windowStart),
    endTime: minutesToTime(bestWindow.windowEnd)
  };
}

function buildNoCoverageWarnings({ assignments, staffingRequirements, earliestStart, latestEnd, timeToMinutes }) {
  const warnings = [];
  const slots = buildQuarterHourSlots(earliestStart, latestEnd);
  if (slots.length === 0) {
    return warnings;
  }

  const requiredUnits = [...new Set(
    staffingRequirements
      .filter((requirement) =>
        requirement &&
        requirement.unitName &&
        !String(requirement.position || '').includes('Break Cover') &&
        !String(requirement.unitName || '').includes('Nexus Zonal Leads')
      )
      .map((requirement) => requirement.unitName)
  )];

  for (const unitName of requiredUnits) {
    let gapStart = null;

    for (const slotStart of slots) {
      const hasCoverage = assignments.some((assignment) => {
        if (assignment.unit !== unitName || assignment.isBreak || assignment.staff === 'UNFILLED') {
          return false;
        }

        const start = timeToMinutes(assignment.startTime);
        const end = timeToMinutes(assignment.endTime);
        return start <= slotStart && end > slotStart;
      });

      if (!hasCoverage) {
        if (gapStart === null) {
          gapStart = slotStart;
        }
      } else if (gapStart !== null) {
        if (slotStart - gapStart >= 60) {
          const gapDuration = slotStart - gapStart;
          const severity = gapDuration >= 120 ? 'high' : 'medium';
          warnings.push({
            type: 'no_coverage_gap',
            severity,
            unit: unitName,
            startTime: minutesToTime(gapStart),
            endTime: minutesToTime(slotStart),
            durationMinutes: gapDuration,
            message: `${unitName} has no cover between ${minutesToTime(gapStart)}-${minutesToTime(slotStart)}`
          });
        }
        gapStart = null;
      }
    }

    if (gapStart !== null) {
      const finalGapEnd = latestEnd;
      if (finalGapEnd - gapStart >= 60) {
        const gapDuration = finalGapEnd - gapStart;
        const severity = gapDuration >= 120 ? 'high' : 'medium';
        warnings.push({
          type: 'no_coverage_gap',
          severity,
          unit: unitName,
          startTime: minutesToTime(gapStart),
          endTime: minutesToTime(finalGapEnd),
          durationMinutes: gapDuration,
          message: `${unitName} has no cover between ${minutesToTime(gapStart)}-${minutesToTime(finalGapEnd)}`
        });
      }
    }
  }

  const severityRank = { high: 2, medium: 1, low: 0 };

  return warnings
    .sort((left, right) => {
      const bySeverity = (severityRank[right.severity] || 0) - (severityRank[left.severity] || 0);
      if (bySeverity !== 0) {
        return bySeverity;
      }

      const byStart = timeToMinutes(left.startTime) - timeToMinutes(right.startTime);
      if (byStart !== 0) {
        return byStart;
      }

      return (right.durationMinutes || 0) - (left.durationMinutes || 0);
    })
    .slice(0, 8);
}

function buildAssignmentInsights({
  assignments = [],
  staffingRequirements = [],
  zone,
  dayCode,
  assignedCount = 0,
  totalRequired = 0,
  timeToMinutes
}) {
  if (!Array.isArray(assignments) || assignments.length === 0) {
    return {
      summary: 'No assignments were generated for this run.',
      warnings: []
    };
  }

  const productiveAssignments = assignments.filter((assignment) =>
    assignment &&
    assignment.unit &&
    assignment.staff &&
    assignment.staff !== 'UNFILLED' &&
    !assignment.isBreak &&
    !String(assignment.unit).includes('Break Cover') &&
    assignment.unit !== 'Zonal Lead'
  );

  if (productiveAssignments.length === 0) {
    return {
      summary: 'No active unit assignments were available to analyze.',
      warnings: []
    };
  }

  const startTimes = productiveAssignments.map((assignment) => timeToMinutes(assignment.startTime));
  const endTimes = productiveAssignments.map((assignment) => timeToMinutes(assignment.endTime));
  const earliestStart = Math.min(...startTimes);
  const latestEnd = Math.max(...endTimes);

  const uniqueStaffCount = new Set(productiveAssignments.map((assignment) => assignment.staff)).size;
  const coveredUnits = new Set(productiveAssignments.map((assignment) => assignment.unit));

  const requiredUnits = new Set(
    staffingRequirements
      .filter((requirement) => requirement.unitName && !String(requirement.position || '').includes('Break Cover'))
      .map((requirement) => requirement.unitName)
  );

  const busiestWindow = buildBusiestWindow(productiveAssignments, earliestStart, latestEnd, timeToMinutes);

  const warnings = buildNoCoverageWarnings({
    assignments: productiveAssignments,
    staffingRequirements,
    earliestStart,
    latestEnd,
    timeToMinutes
  });

  const zoneLabel = String(zone || 'Zone').replace(/_/g, ' ');
  const coverageRate = totalRequired > 0 ? Math.round((assignedCount / totalRequired) * 100) : 0;

  const summaryParts = [
    `${zoneLabel} (Day Code ${dayCode}): ${assignedCount}/${totalRequired} positions filled (${coverageRate}%).`,
    `${uniqueStaffCount} staff actively assigned across ${coveredUnits.size} units.`
  ];

  if (requiredUnits.size > 0) {
    summaryParts.push(`${coveredUnits.size}/${requiredUnits.size} selected units received staffing.`);
  }

  if (busiestWindow) {
    summaryParts.push(`Busiest period was ${busiestWindow.startTime}-${busiestWindow.endTime}.`);
  }

  return {
    summary: summaryParts.join(' '),
    warnings
  };
}

module.exports = {
  buildAssignmentInsights
};
