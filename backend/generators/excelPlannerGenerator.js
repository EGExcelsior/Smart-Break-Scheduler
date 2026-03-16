/**
 * Excel Planner Generator - V8.0 WITH UNIT GROUPING
 * 
 * Features:
 * - Staff grouped by their primary unit/ride assignment
 * - Special sections: Zonal Leads, Senior Hosts, Park-Wide Units
 * - Unit headers with emoji icons
 * - Ride-specific colors from Skills Matrix
 * - Briefing detection (gold 09:15 cells)
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
  addSpacerRow,
  renderZonalLeadsSection,
  renderIssuesSection,
  renderUnassignedSection
} = require('./excelLayoutHelpers');

// Helper function to check if a staff member is a Senior Host (with fuzzy name matching)
function isSeniorHost(staffName, seniorHostList) {
  if (!seniorHostList || seniorHostList.length === 0) return false;
  return seniorHostList.some(seniorName => namesMatch(staffName, seniorName));
}

function formatPositionName(unit, position, trainingMatch) {
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

function normalizeForMatching(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
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

  if (assignment && assignment.hasBriefing && timeSlot === '09:15') {
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
        row.push(formatPositionName(assignment.coverageUnit, assignment.coveragePosition, false));
      } else {
        row.push(formatPositionName(assignment.unit, assignment.position, assignment.trainingMatch));
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

// ✅ NEW: Categorize unit type
function getUnitCategory(unitName) {
  const lower = unitName.toLowerCase();
  
  if (lower.includes('entrance') || lower.includes('admissions')) return 'Admissions';
  if (lower.includes('shop') || lower.includes('retail') || lower.includes('kiosk') || 
      lower.includes('sealife') || lower.includes('lorikeets') || lower.includes('ben') ||
      lower.includes('explorer supplies')) return 'Retail';
  if (lower.includes('car park')) return 'Car Parks';
  if (lower.includes('ghi')) return 'GHI';
  if (lower.includes('break cover')) return 'Break Cover';
  
  return 'Rides';
}

// ✅ NEW: Group staff by their primary unit
function groupStaffByUnit(assignments, staffList) {
  const unitGroups = new Map(); // unit name -> [staff names]
  
  // Calculate where each staff spends most time
  for (const staff of staffList) {
    if (staff.unassigned) continue;
    
    const staffAssignments = assignments.filter(a => 
      normalizeForMatching(a.staff) === normalizeForMatching(staff.name) &&
      !a.isBreak &&
      a.unit !== 'Zonal Lead'
    );
    
    if (staffAssignments.length === 0) continue;
    
    // Use the FIRST unit chronologically, skipping temporary pre-pass units like
    // Azteca Entrance (which is always a short 08:30–10:00 stint before moving to Lodge).
    // This keeps Amra/Lydia grouped with Lodge, while still fixing Explorer→Sweet interleaving.
    const SKIP_AS_PRIMARY = new Set(['Azteca Entrance']);
    const sortedByStart = staffAssignments.slice().sort((a, b) => {
      const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      return toMins(a.startTime) - toMins(b.startTime);
    });
    const firstNonTemp = sortedByStart.find(a => !SKIP_AS_PRIMARY.has(a.unit));
    let maxUnit = firstNonTemp?.unit || sortedByStart[0]?.unit || null;
    
    if (maxUnit) {
      if (!unitGroups.has(maxUnit)) {
        unitGroups.set(maxUnit, []);
      }
      unitGroups.get(maxUnit).push(staff.name);
    }
  }
  
  return { unitGroups };
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
  
  worksheet.mergeCells('A1:G1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `TEAM ${teamName.toUpperCase()} - BREAK PLANNER`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 25;
  
  worksheet.mergeCells('A2:G2');
  const dateCell = worksheet.getCell('A2');
  dateCell.value = `Date: ${new Date(date).toLocaleDateString('en-GB', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}`;
  dateCell.font = { size: 12, bold: true };
  dateCell.alignment = { horizontal: 'center' };
  
  worksheet.mergeCells('A3:G3');
  const dayCodeCell = worksheet.getCell('A3');
  dayCodeCell.value = `Day Code: ${dayCode} - ${dayCodeName}`;
  dayCodeCell.font = { size: 11, italic: true };
  dayCodeCell.alignment = { horizontal: 'center' };
  
  worksheet.mergeCells('A4:G4');
  const statsCell = worksheet.getCell('A4');
  statsCell.value = `Staff: ${staffList.length} | Positions Filled: ${statistics.filledCount}/${statistics.totalPositions} | Fill Rate: ${statistics.fillRate}%`;
  statsCell.font = { size: 10 };
  statsCell.alignment = { horizontal: 'center' };
  statsCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E6E6' }
  };
  
  addSpacerRow(worksheet, 6); // ✅ Thin spacer row
  
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
  
  let earliestStart = '23:59';
  let latestEnd = '00:00';
  
  for (const assignment of assignments) {
    if (assignment.startTime < earliestStart) earliestStart = assignment.startTime;
    if (assignment.endTime > latestEnd) latestEnd = assignment.endTime;
  }
  
  if (earliestStart === '23:59') earliestStart = '08:30';
  if (latestEnd === '00:00') latestEnd = '19:45';
  
  // ✅ SIGNIFICANT TIMES ONLY: Only show columns where something actually changes
  // Collect all key moments: shift starts/ends, break starts/ends, briefing slot
  const significantTimesSet = new Set();

  for (const assignment of assignments) {
    if (assignment.startTime) significantTimesSet.add(assignment.startTime);
    if (assignment.endTime) significantTimesSet.add(assignment.endTime);
    if (assignment.breakStart) significantTimesSet.add(assignment.breakStart);
    if (assignment.breakEnd) significantTimesSet.add(assignment.breakEnd);
  }

  // Also include staffList start/end times
  for (const staff of staffList) {
    if (staff.startTime) significantTimesSet.add(staff.startTime);
    if (staff.endTime) significantTimesSet.add(staff.endTime);
  }

  // Always include briefing time
  significantTimesSet.add('09:15');

  // Sort chronologically, only keep slots that align with 15-min grid within overall range
  const allPossibleSlots = generateTimeSlots(earliestStart, latestEnd, 15);
  const timeSlots = allPossibleSlots.filter(slot => significantTimesSet.has(slot));
  
  // ========================================================================
  // ✅ GROUP STAFF BY UNIT
  // ========================================================================
  
  const { unitGroups } = groupStaffByUnit(assignments, staffList);
  
  // Sort units by category
  const sortedUnits = Array.from(unitGroups.keys()).sort((a, b) => {
    const catA = getUnitCategory(a);
    const catB = getUnitCategory(b);
    
    const categoryOrder = {
      'Rides': 1,
      'Retail': 2,
      'Admissions': 3,
      'Car Parks': 4,
      'GHI': 5,
      'Break Cover': 6
    };
    
    const orderA = categoryOrder[catA] || 99;
    const orderB = categoryOrder[catB] || 99;
    
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });
  
  // ========================================================================
  // ✅ SPLIT STAFF INTO RIDES AND RETAIL/ADMISSIONS/GHI SECTIONS
  // ========================================================================

  // Separate staff by category
  const ridesStaff = [];
  const retailStaff = [];
  const carParksGhiStaff = [];
  
  for (const unitName of sortedUnits) {
    const staffInUnit = unitGroups.get(unitName);
    if (!staffInUnit || staffInUnit.length === 0) continue;
    
    const category = getUnitCategory(unitName);
    const isRidesSection = category === 'Rides' || unitName.toLowerCase().includes('rides break cover');
    const isCarParksGhi = category === 'Car Parks' || category === 'GHI';
    
    let targetArray;
    if (isRidesSection) targetArray = ridesStaff;
    else if (isCarParksGhi) targetArray = carParksGhiStaff;
    else targetArray = retailStaff;
    
    for (const staffName of staffInUnit) {
      if (!targetArray.includes(staffName)) {
        targetArray.push(staffName);
      }
    }
  }
  
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
  
  addSpacerRow(worksheet, 6); // ✅ Thin spacer row
  const legendRow = worksheet.addRow(['']);
  legendRow.getCell(1).value = '🎨 Planner separated into RIDES and RETAIL sections | Senior Hosts highlighted in light blue | Colors match Skills Matrix | BREAK = White | BRIEFING = Gold (09:15)';
  legendRow.getCell(1).font = { italic: true, size: 9 };
  legendRow.getCell(1).alignment = { horizontal: 'left', wrapText: true };
  worksheet.mergeCells(legendRow.number, 1, legendRow.number, Math.min(7, timeSlots.length + 1));
  
  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelPlanner };
