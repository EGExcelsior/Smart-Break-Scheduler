/**
 * Excel Planner Generator - V8.0 WITH UNIT GROUPING
 * 
 * Features:
 * - Staff grouped by their primary unit/ride assignment
 * - Special sections: Zonal Leads, Senior Hosts, Park-Wide Units
 * - Unit headers with emoji icons
 * - Ride-specific colors from Skills Matrix
 * - Briefing detection (gold 15-min cells at 09:15 / 11:00)
 * 
 * @module excelPlannerGenerator
 * @version 8.0
 */

const ExcelJS = require('exceljs');
const { namesMatch } = require('../utils/nameMatching');
const {
  SENIOR_HOST_COLOR,
  getRideColor,
  getUnitAbbreviation
} = require('./excelPlannerConstants');
const {
  renderPlannerHeaderSection,
  renderPlannerLegend,
  renderZonalLeadsSection,
  renderIssuesSection,
  renderUnassignedSection
} = require('./excelLayoutHelpers');
const {
  normalizeForMatching,
  getUnitCategory,
  groupStaffByUnit,
  getSortedUnits,
  splitStaffBySection
} = require('./excelPlannerStaffUtils');
const { buildSignificantTimeSlots } = require('./excelPlannerTimeUtils');

// Helper function to check if a staff member is a Senior Host (with fuzzy name matching)
function isSeniorHost(staffName, seniorHostList) {
  if (!seniorHostList || seniorHostList.length === 0) return false;
  return seniorHostList.some(seniorName => namesMatch(staffName, seniorName));
}

function formatPositionName(unit, position) {
  const category = getUnitCategory(unit);
  if (category !== 'Rides') {
    return getUnitAbbreviation(unit) || unit.toUpperCase();
  }
  const rideName = unit.replace(/ ?-? ?(OP|ATT|Operator|Attendant|Host|Driver|Skill|Senior)$/i, '').trim();
  let posType = '', fullPos = position;
  const posLower = position.toLowerCase();
  if (posLower.includes('operator')) { posType = 'OP'; fullPos = 'Operator'; }
  else if (posLower.includes('attendant')) { posType = 'ATT'; fullPos = 'Attendant'; }
  else if (posLower.includes('host')) { posType = 'HOST'; fullPos = 'Host'; }
  else if (posLower.includes('senior')) posType = 'SEN';
  else posType = position.substring(0, 3).toUpperCase();
  return `${rideName.toUpperCase()} - ${posType}`;
}

function getHomeLabel(endTime) {
  const [hour, min] = endTime.split(':').map(Number);
  const pmHour = hour - 12;
  if (min === 0) return `Home @${pmHour}`;
  return `Home @${pmHour}:${min.toString().padStart(2, '0')}`;
}

function getStaffEndTime(assignments, staffName) {
  const normalizedSearch = normalizeForMatching(staffName);
  let latest = null;
  for (const a of assignments) {
    const match = a.staff === staffName || normalizeForMatching(a.staff) === normalizedSearch;
    if (!match) continue;
    if (!latest || a.endTime > latest) latest = a.endTime;
  }
  return latest;
}

function findAssignmentAtTime(assignments, staffName, timeSlot) {
  if (!assignments || !staffName || !timeSlot) return null;
  
  const [slotHour, slotMin] = timeSlot.split(':').map(Number);
  const slotMinutes = slotHour * 60 + slotMin;
  
  const normalizedSearchName = normalizeForMatching(staffName);
  
  const matches = [];
  
  for (const assignment of assignments) {
    let isMatch = assignment.staff === staffName;
    
    if (!isMatch) {
      const normalizedAssignmentName = normalizeForMatching(assignment.staff);
      isMatch = normalizedAssignmentName === normalizedSearchName;
    }
    
    if (!isMatch) continue;
    
    const [startHour, startMin] = assignment.startTime.split(':').map(Number);
    const [endHour, endMin] = assignment.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (slotMinutes >= startMinutes && slotMinutes < endMinutes) {
      matches.push(assignment);
    }
  }
  
  if (matches.length === 0) return null;
  
  // ✅ Check if this staff has coverage assignments at this time
  const baseMatch = matches.find(a => a.isSmartBreakCover) || matches[0];
  
  if (baseMatch.coverageAssignments && baseMatch.coverageAssignments.length > 0) {
    const [slotHour, slotMin] = timeSlot.split(':').map(Number);
    const slotMinutes = slotHour * 60 + slotMin;
    
    for (const coverage of baseMatch.coverageAssignments) {
      const [covStartHour, covStartMin] = coverage.startTime.split(':').map(Number);
      const [covEndHour, covEndMin] = coverage.endTime.split(':').map(Number);
      const covStartMinutes = covStartHour * 60 + covStartMin;
      const covEndMinutes = covEndHour * 60 + covEndMin;
      
      if (slotMinutes >= covStartMinutes && slotMinutes < covEndMinutes) {
        // Return modified assignment showing coverage
        return {
          ...baseMatch,
          isCovering: true,
          coverageUnit: coverage.unit,
          coveragePosition: coverage.position,
          coveringFor: coverage.covering
        };
      }
    }
  }
  
  // ✅ Prefer smart break cover (specific unit) over generic BC position
  return baseMatch;
}

function setThinBorder(cell, useBlackColor = false) {
  const color = useBlackColor ? { color: { argb: 'FF000000' } } : {};
  cell.border = {
    top: { style: 'thin', ...color },
    bottom: { style: 'thin', ...color },
    left: { style: 'thin', ...color },
    right: { style: 'thin', ...color }
  };
}

function stylePlannerTimeCell(cell, timeSlot, assignment, explorerUnits, explorerColor, options = {}) {
  const {
    useExplorerHighlight = true,
    breakBorderWithBlack = false
  } = options;

  const briefingSlot = assignment?.briefingTime || '09:15';
  if (assignment && assignment.hasBriefing && timeSlot === briefingSlot) {
    cell.value = 'LODGE BRIEF';
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
    cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    return;
  }

  if (cell.value === 'BREAK') {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
    setThinBorder(cell, breakBorderWithBlack);
  } else if (cell.value && cell.value.toString().startsWith('Home @')) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    cell.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
  } else if (assignment && (assignment.unit || assignment.isCovering)) {
    const displayUnit = assignment.isCovering ? assignment.coverageUnit : assignment.unit;
    const isExplorerUnit = useExplorerHighlight && explorerUnits && explorerUnits.includes(displayUnit);

    if (isExplorerUnit && explorerColor) {
      const explorerArgb = explorerColor.replace('#', 'FF');
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: explorerArgb } };
      cell.font = { bold: true, size: 8, color: { argb: 'FF000000' } };
    } else {
      const rideColor = getRideColor(displayUnit);
      if (rideColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rideColor } };
        cell.font = { bold: true, size: 8, color: { argb: 'FF000000' } };
      }
    }
  }

  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  setThinBorder(cell);
}

function styleStaffNameCell(cell, staffName, seniorHostStaff) {
  cell.font = { bold: true, size: 10 };
  setThinBorder(cell);

  if (isSeniorHost(staffName, seniorHostStaff)) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: SENIOR_HOST_COLOR }
    };
  }
}

function makeAssignmentLookupKey(staffName, timeSlot) {
  return `${normalizeForMatching(staffName)}|${timeSlot}`;
}

function buildStaffTimeLookup(assignments, staffNames, timeSlots) {
  const lookup = new Map();
  for (const staffName of staffNames) {
    for (const timeSlot of timeSlots) {
      const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
      lookup.set(makeAssignmentLookupKey(staffName, timeSlot), assignment);
    }
  }
  return lookup;
}

function getLookupAssignment(lookup, staffName, timeSlot) {
  return lookup.get(makeAssignmentLookupKey(staffName, timeSlot)) || null;
}

function buildStaffRowValues(staffName, timeSlots, staffEndTime, lookup) {
  const row = [staffName];

  for (const timeSlot of timeSlots) {
    const assignment = getLookupAssignment(lookup, staffName, timeSlot);

    if (assignment) {
      if (assignment.isBreak) {
        row.push('BREAK');
      } else if (assignment.isCovering) {
        row.push(formatPositionName(assignment.coverageUnit, assignment.coveragePosition));
      } else {
        row.push(formatPositionName(assignment.unit, assignment.position));
      }
    } else if (staffEndTime && timeSlot === staffEndTime) {
      row.push(getHomeLabel(staffEndTime));
    } else {
      row.push('');
    }
  }

  return row;
}

function renderStaffTableSection({
  worksheet,
  title,
  titleColor,
  staffNames,
  timeSlots,
  rowHeight,
  assignments,
  explorerUnits,
  explorerColor,
  seniorHostStaff,
  useExplorerHighlight,
  breakBorderWithBlack,
  preSpacerHeight = 0,
  postSpacerHeight = 0
}) {
  if (!staffNames || staffNames.length === 0) return;

  const lastColLetter = String.fromCharCode(64 + timeSlots.length + 1);

  if (preSpacerHeight > 0) {
    const spacerRow = worksheet.addRow([]);
    spacerRow.height = preSpacerHeight;
    worksheet.mergeCells(`A${spacerRow.number}:${lastColLetter}${spacerRow.number}`);
  }

  const sectionRow = worksheet.addRow([]);
  const sectionCell = sectionRow.getCell(1);
  sectionCell.value = title;
  sectionCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: titleColor } };
  worksheet.mergeCells(`A${sectionRow.number}:${lastColLetter}${sectionRow.number}`);
  sectionCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sectionRow.height = 25;

  const headerRow = worksheet.addRow(['STAFF NAME', ...timeSlots]);
  const headerRowObj = worksheet.getRow(headerRow.number);
  headerRowObj.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
  headerRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRowObj.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRowObj.height = 18;

  const lookup = buildStaffTimeLookup(assignments, staffNames, timeSlots);

  for (const staffName of staffNames) {
    const staffEndTime = getStaffEndTime(assignments, staffName);
    const rowValues = buildStaffRowValues(staffName, timeSlots, staffEndTime, lookup);
    const staffRow = worksheet.addRow(rowValues);
    staffRow.height = rowHeight;

    for (let col = 2; col <= timeSlots.length + 1; col++) {
      const cell = staffRow.getCell(col);
      const timeSlot = timeSlots[col - 2];
      const assignment = getLookupAssignment(lookup, staffName, timeSlot);

      stylePlannerTimeCell(cell, timeSlot, assignment, explorerUnits, explorerColor, {
        useExplorerHighlight,
        breakBorderWithBlack
      });
    }

    styleStaffNameCell(staffRow.getCell(1), staffName, seniorHostStaff);
  }

  if (postSpacerHeight > 0) {
    const spacerRow = worksheet.addRow([]);
    spacerRow.height = postSpacerHeight;
  }
}

async function generateExcelPlanner(scheduleData) {
  const {
    teamName,
    date,
    dayCode,
    dayCodeName,
    assignments,
    staffList,
    statistics,
    alerts,
    explorerColor,   // ✅ Color for Explorer units
    explorerUnits,   // ✅ List of Explorer units to highlight
    seniorHostStaff  // ✅ List of Senior Host staff names
  } = scheduleData;
  
  // 🔍 DEBUG: Log Senior Host data received
  console.log('═'.repeat(80));
  console.log('🔍 DEBUG - Excel Generator received seniorHostStaff:');
  console.log('  Value:', seniorHostStaff);
  console.log('  Type:', typeof seniorHostStaff);
  console.log('  Is Array?:', Array.isArray(seniorHostStaff));
  console.log('  Length:', seniorHostStaff ? seniorHostStaff.length : 'UNDEFINED');
  if (seniorHostStaff && seniorHostStaff.length > 0) {
    console.log('  First 3 names:', seniorHostStaff.slice(0, 3));
  }
  console.log('═'.repeat(80));
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Break Planner');
  const TOP_SECTION_END_COL = 'G';
  
  // ========================================================================
  // TITLE & INFO SECTION
  // ========================================================================

  renderPlannerHeaderSection(worksheet, {
    teamName,
    date,
    dayCode,
    dayCodeName,
    statsText: `Staff: ${staffList.length} | Positions Filled: ${statistics.filledCount}/${statistics.totalPositions} | Fill Rate: ${statistics.fillRate}%`,
    mergeEndCol: TOP_SECTION_END_COL
  });
  
  // ========================================================================
  // ZONAL LEADS SECTION
  // ========================================================================
  
  const zonalLeads = assignments.filter(a => {
    const posLower = a.position.toLowerCase();
    return posLower.includes('zonal lead') || posLower === 'zonal leads';
  });
  
  renderZonalLeadsSection(worksheet, zonalLeads, TOP_SECTION_END_COL);

  // ========================================================================
  // ISSUES SECTION (e.g. Absence code with scheduled shifts)
  // ========================================================================

  renderIssuesSection(worksheet, alerts, TOP_SECTION_END_COL);
  
  // ========================================================================
  // TIME SLOTS
  // ========================================================================

  const timeSlots = buildSignificantTimeSlots(assignments, staffList);
  
  // ========================================================================
  // ✅ GROUP STAFF BY UNIT
  // ========================================================================
  
  const { unitGroups } = groupStaffByUnit(assignments, staffList);
  
  // Sort units by category
  const sortedUnits = getSortedUnits(unitGroups);
  
  // ========================================================================
  // ✅ SPLIT STAFF INTO RIDES AND RETAIL/ADMISSIONS/GHI SECTIONS
  // ========================================================================

  const { ridesStaff, retailStaff, carParksGhiStaff } = splitStaffBySection(sortedUnits, unitGroups);
  
  console.log(`📊 Split: ${ridesStaff.length} rides staff, ${retailStaff.length} retail/admissions staff, ${carParksGhiStaff.length} car parks/GHI staff`);
  
  // ========================================================================
  // RIDES SECTION
  // ========================================================================
  
  renderStaffTableSection({
    worksheet,
    title: '🎢 RIDES & ATTRACTIONS',
    titleColor: 'FF5B9BD5',
    staffNames: ridesStaff,
    timeSlots,
    rowHeight: 35,
    assignments,
    explorerUnits,
    explorerColor,
    seniorHostStaff,
    useExplorerHighlight: true,
    breakBorderWithBlack: true,
    postSpacerHeight: 10
  });
  
  // ========================================================================
  // RETAIL / ADMISSIONS / GHI SECTION
  // ========================================================================
  
  renderStaffTableSection({
    worksheet,
    title: '🛍️ RETAIL / ADMISSIONS',
    titleColor: 'FF70AD47',
    staffNames: retailStaff,
    timeSlots,
    rowHeight: 25,
    assignments,
    explorerUnits,
    explorerColor,
    seniorHostStaff,
    useExplorerHighlight: true,
    breakBorderWithBlack: true
  });
  
  
  // ========================================================================
  // UNASSIGNED STAFF SECTION
  // ========================================================================
  
  renderUnassignedSection(worksheet, staffList, TOP_SECTION_END_COL);
  
  // ========================================================================
  // CAR PARKS & GHI SECTION
  // ========================================================================

  renderStaffTableSection({
    worksheet,
    title: '🅿️ CAR PARKS & GHI',
    titleColor: 'FF70AD47',
    staffNames: carParksGhiStaff,
    timeSlots,
    rowHeight: 25,
    assignments,
    explorerUnits,
    explorerColor,
    seniorHostStaff,
    useExplorerHighlight: false,
    breakBorderWithBlack: false,
    preSpacerHeight: 12
  });

  // ========================================================================
  // FORMATTING
  // ========================================================================
  
  worksheet.getColumn(1).width = 22;
  for (let i = 2; i <= timeSlots.length + 1; i++) {
    worksheet.getColumn(i).width = 11;
  }
  
  // ========================================================================
  // LEGEND
  // ========================================================================
  
  renderPlannerLegend(
    worksheet,
    timeSlots.length,
    '🎨 Planner separated into RIDES and RETAIL sections | Senior Hosts highlighted in light blue | Colors match Skills Matrix | BREAK = White | BRIEFING = Gold (09:15/11:00)'
  );
  
  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelPlanner };
