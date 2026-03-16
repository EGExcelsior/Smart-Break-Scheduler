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

// === RIDE COLOR MAPPING (from Chessington Skills Matrix) ===
const RIDE_COLORS = {
  // === NEXUS ZONE ===
  'Adventure Tree': 'FFC28446',
  'Tiny Truckers': 'FFD600B8',
  "Griffin's Galleon": 'FFFFC000',
  "Griffin's Galeon": 'FFFFC000',
  'Sea Dragons': 'FF33CCCC',
  "Elmer's Flying Jumbos": 'FFFFAFD7',
  "Dragon's Playhouse": 'FF009242',
  'Canopy Capers': 'FF70AD47',
  'Room on the Broom': 'FF7030A0',
  
  // === ODYSSEY ZONE ===
  "Dragon's Fury": 'FFFF9999',
  'Rattlesnake': 'FF4F81BD',
  'Zufari': 'FFFFFFCC',
  'Croc Drop': 'FFC0504D',
  'River Rafts': 'FFF79646',
  'Tomb Blaster': 'FFCD9B69',
  'Jungle Rangers': 'FF4BACC6',
  'Tree Top Hoppers': 'FFC0504D',
  'Treetop Hoppers': 'FFC0504D',
  'Monkey Swinger': 'FFD9D9D9',
  
  "Paw Patrol Chase's": 'FF9BBB59',
  "Chase's": 'FF9BBB59',
  "Paw Patrol Marshall's": 'FFF56B6B',
  "Marshall's": 'FFF56B6B',
  "Paw Patrol Skye's": 'FF8064A2',
  "Skye's": 'FF8064A2',
  "Paw Patrol Zuma's": 'FFFFC000',
  "Zumas's": 'FFFFC000',
  
  // === PHANTOM ZONE ===
  'Vampire': 'FF8064A2',
  'Mandrill Mayhem': 'FF4BACC6',
  'Tiger Rock': 'FFFFC000',
  'Gruffalo River Ride': 'FFFB7A05',
  'Gruffalo': 'FFFB7A05',
  'Ostrich Stampede': 'FF968476',
  'Blue Barnacle': 'FF0070C0',
  'Seastorm': 'FF00B0F0',
  'Mamba Strike': 'FFC00000',
  'Barrel Bail Out': 'FFC28446',
  'Trawler Trouble': 'FFF79646',
  
  // === RETAIL ===
  'Adventure Point Gift Shop': 'FFC28446',
  'Adventures Point Gift Shop': 'FFC28446',
  'Sweet Shop': 'FFFFAFD7',
  'Sealife': 'FF00B0F0',
  'Sea Life': 'FF00B0F0',
  "Ben & Jerry's": 'FF5B9BD5',
  "Ben & Jerry's Kiosk": 'FF5B9BD5',
  'Ben and Jerry\'s Kiosk': 'FF5B9BD5',
  'Explorer Supplies': 'FFC55A54',
  'Lorikeets': 'FF70AD47',
  'Dragon Treats': 'FF00B050',
  
  'Paw Patrol Shop': 'FF00B0F0',
  'Croc Drop Shop': 'FF4BACC6',
  'Gruffalo Shop': 'FFFB7A05',
  'Gruffalo Gift Shop': 'FFFB7A05',
  'Jumanji Shop': 'FF3C7D22',
  'Shipwreck Kiosk': 'FFC28446',
  'Tiger Kiosk': 'FFFFC000',
  
  // === ADMISSIONS ===
  'Admissions': 'FF4BACC6',
  'Lodge Entrance': 'FF4BACC6',
  'Explorer Entrance': 'FF4BACC6',
  'Azteca Entrance': 'FF2E75B6',
  'Schools Entrance': 'FF4BACC6',
  
  // === GHI ===
  'GHI - Hub': 'FFFFFF99',
  'GHI - Help Squad': 'FFFFFF99',
  'GHI - Rap': 'FFFFFF99',
  
  // === CAR PARKS ===
  'Car Parks - Staff Car Park': 'FF808080',
  'Car Parks - Hotel Car Park': 'FF808080',
  
  // === BREAK COVER ===
  'Rides Break Cover': 'FFFF6600',
  'Retail Break Cover': 'FFFF9900',
};

// === SENIOR HOST HIGHLIGHTING ===
const SENIOR_HOST_COLOR = 'FFB9CDE5';  // Light blue (theme 4, tint 0.6)

// Helper function to check if a staff member is a Senior Host (with fuzzy name matching)
function isSeniorHost(staffName, seniorHostList) {
  if (!seniorHostList || seniorHostList.length === 0) return false;
  return seniorHostList.some(seniorName => namesMatch(staffName, seniorName));
}

function getRideColor(unitName) {
  if (!unitName) return null;
  const baseName = unitName
    .replace(/ ?-? ?(OP|ATT|Operator|Attendant|Host|Driver|Skill|Senior)$/i, '')
    .trim();
  
  if (RIDE_COLORS[baseName]) {
    return RIDE_COLORS[baseName];
  }
  
  for (const [ride, color] of Object.entries(RIDE_COLORS)) {
    if (baseName.toLowerCase().includes(ride.toLowerCase()) || 
        ride.toLowerCase().includes(baseName.toLowerCase())) {
      return color;
    }
  }
  
  return 'FFD9D9D9';
}

const UNIT_ABBREVIATIONS = {
  'Adventures Point Gift Shop': 'APGS', 'Adventure Point Gift Shop': 'APGS',
  'Sweet Shop': 'SWEET', 'Sealife': 'SEA LIFE', 'Sea Life': 'SEA LIFE',
  "Ben & Jerry's": "B&Js", "Ben & Jerry's Kiosk": 'B&Js KIOSK',
  'Dragon Treats': 'DRAGON TREATS', 'Lorikeets': 'LORIKEETS',
  'Croc Drop Shop': 'CROC SHOP', 'Freestyle & Vending': 'FREESTYLE',
  'Paw Patrol Shop': 'PAW SHOP', 'Zufari Barrow': 'ZUFARI BAR',
  'Gruffalo Shop': 'GRUFF SHOP', 'Gruffalo Gift Shop': 'GRUFF SHOP',
  'Jumanji Shop': 'JUMANJI', 'Shipwreck Kiosk': 'SHIPWRECK', 'Tiger Kiosk': 'TIGER KIOSK',
  'Lodge Entrance': 'LODGE', 'Explorer Entrance': 'EXPLORER',
  'Azteca Entrance': 'AZTECA', 'Schools Entrance': 'SCHOOLS',
  'Explorer Supplies': 'SUPPLIES',
  'GHI - Hub': 'GHI', 'GHI - Help Squad': 'GHI', 'GHI - Rap': 'GHI',
  'Car Parks - Staff Car Park': 'CAR PARKS', 'Car Parks - Hotel Car Park': 'CAR PARKS',
  'Car Parks - Express': 'CAR PARKS', 'Car Parks - Split': 'CAR PARKS',
  'Car Parks - Flamingo': 'CAR PARKS', 'Car Parks - Giraffe': 'CAR PARKS',
  'Car Parks - Gorilla': 'CAR PARKS', 'Car Parks - Additional Schools': 'CAR PARKS',
  'Retail Break Cover': 'RETAIL BC', 'Rides Break Cover': 'RIDES BC',
};

function getUnitAbbreviation(unitName) {
  if (!unitName) return null;
  if (UNIT_ABBREVIATIONS[unitName]) return UNIT_ABBREVIATIONS[unitName];
  for (const [key, abbr] of Object.entries(UNIT_ABBREVIATIONS)) {
    if (unitName.toLowerCase().includes(key.toLowerCase()) ||
        key.toLowerCase().includes(unitName.toLowerCase())) return abbr;
  }
  return null;
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

// ✅ NEW: Get unit category icon
function getUnitIcon(unitName) {
  const lower = unitName.toLowerCase();
  
  if (lower.includes('entrance') || lower.includes('admissions')) return '🎫';
  if (lower.includes('shop') || lower.includes('retail') || lower.includes('kiosk') || 
      lower.includes('sealife') || lower.includes('lorikeets') || lower.includes('ben')) return '🛍️';
  if (lower.includes('car park')) return '🚗';
  if (lower.includes('ghi')) return '🎧';
  if (lower.includes('break cover')) return '🔄';
  
  return '🎢'; // Default for rides
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
  const staffPrimaryUnit = new Map(); // staff name -> primary unit
  
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
      staffPrimaryUnit.set(staff.name, maxUnit);
      
      if (!unitGroups.has(maxUnit)) {
        unitGroups.set(maxUnit, []);
      }
      unitGroups.get(maxUnit).push(staff.name);
    }
  }
  
  return { unitGroups, staffPrimaryUnit };
}

async function generateExcelPlanner(scheduleData) {
  const {
    teamName,
    date,
    dayCode,
    dayCodeName,
    dayCodeDescription,
    assignments,
    staffList,
    statistics,
    alerts,
    competencyWarnings,
    parkWideUnits,
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
  
  worksheet.addRow([]);
  worksheet.lastRow.height = 6;  // ✅ Thin spacer row
  
  // ========================================================================
  // ZONAL LEADS SECTION
  // ========================================================================
  
  const zonalLeads = assignments.filter(a => {
    const posLower = a.position.toLowerCase();
    return posLower.includes('zonal lead') || posLower === 'zonal leads';
  });
  
  const zonalLeadNames = new Set();
  
  if (zonalLeads.length > 0) {
    const leadsHeaderRow = worksheet.addRow([]);
    const leadsHeader = leadsHeaderRow.getCell(1);
    leadsHeader.value = '🔑 ZONAL LEADS - ROAMING';
    leadsHeader.font = { size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
    leadsHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    };
    worksheet.mergeCells(`A${leadsHeaderRow.number}:G${leadsHeaderRow.number}`);
    leadsHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    leadsHeaderRow.height = 20;
    
    for (const lead of zonalLeads) {
      zonalLeadNames.add(lead.staff);
      
      const leadRow = worksheet.addRow([
        `${lead.staff} (${lead.startTime} - ${lead.endTime})`
      ]);
      
      leadRow.getCell(1).font = { size: 11, bold: true, color: { argb: 'FF000000' } };
      leadRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2EFD9' }
      };
      
      worksheet.mergeCells(`A${leadRow.number}:G${leadRow.number}`);
    }
    
    worksheet.addRow([]);
    worksheet.lastRow.height = 6;  // ✅ Thin spacer row
  }

  // ========================================================================
  // ISSUES SECTION (e.g. Absence code with scheduled shifts)
  // ========================================================================

  const absenceWithShiftIssues = alerts?.absenceWithShift || [];
  const issuesHeaderRow = worksheet.addRow([]);
  const issuesHeader = issuesHeaderRow.getCell(1);
  const hasIssues = absenceWithShiftIssues.length > 0;

  issuesHeader.value = hasIssues
    ? `⚠️ ISSUES TO REVIEW (${absenceWithShiftIssues.length})`
    : '✅ ISSUES TO REVIEW (0)';
  issuesHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  issuesHeader.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hasIssues ? 'FFF4B183' : 'FF70AD47' }
  };
  worksheet.mergeCells(`A${issuesHeaderRow.number}:G${issuesHeaderRow.number}`);
  issuesHeader.alignment = { horizontal: 'center', vertical: 'middle' };
  issuesHeaderRow.height = 20;

  if (hasIssues) {
    for (const issue of absenceWithShiftIssues) {
      const issueStatus = issue.includedByOverride ? 'INCLUDED BY OVERRIDE' : 'SKIPPED';
      const issueRow = worksheet.addRow([
        `${issue.name} (${issue.startTime} - ${issue.endTime}) | ${issue.plannedFunction} | Absence Code: ${issue.absenceCode}${issue.absenceReason ? ` - ${issue.absenceReason}` : ''} | ${issueStatus}`
      ]);

      issueRow.getCell(1).font = { size: 10, bold: true, color: { argb: 'FF7F6000' } };
      issueRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF2CC' }
      };

      worksheet.mergeCells(`A${issueRow.number}:G${issueRow.number}`);
    }
  } else {
    const noIssuesRow = worksheet.addRow(['No issues detected from TimeGrip absence checks.']);
    noIssuesRow.getCell(1).font = { size: 10, bold: true, color: { argb: 'FF1B5E20' } };
    noIssuesRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2F0D9' }
    };
    worksheet.mergeCells(`A${noIssuesRow.number}:G${noIssuesRow.number}`);
  }

  worksheet.addRow([]);
  worksheet.lastRow.height = 6;
  
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
  
  const { unitGroups, staffPrimaryUnit } = groupStaffByUnit(assignments, staffList);
  
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
  
  if (ridesStaff.length > 0) {
    const ridesSectionRow = worksheet.addRow([]);
    const ridesSectionCell = ridesSectionRow.getCell(1);
    ridesSectionCell.value = '🎢 RIDES & ATTRACTIONS';
    ridesSectionCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };  // ✅ Larger font
    ridesSectionCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF5B9BD5' }
    };
    worksheet.mergeCells(`A${ridesSectionRow.number}:${String.fromCharCode(64 + timeSlots.length + 1)}${ridesSectionRow.number}`);
    ridesSectionCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ridesSectionRow.height = 25;  // ✅ Taller header
    
    // Header row for rides
    const ridesHeaderRow = worksheet.addRow(['STAFF NAME', ...timeSlots]);
    const ridesHeaderRowObj = worksheet.getRow(ridesHeaderRow.number);
    ridesHeaderRowObj.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ridesHeaderRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    ridesHeaderRowObj.alignment = { horizontal: 'center', vertical: 'middle' };
    ridesHeaderRowObj.height = 18;
    
    // Rides staff rows
    for (const staffName of ridesStaff) {
      const row = [staffName];
      const staffEndTime = getStaffEndTime(assignments, staffName);
      
      for (const timeSlot of timeSlots) {
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
        
        if (assignment) {
          if (assignment.isBreak) {
            row.push('BREAK');
          } else if (assignment.isCovering) {
            const formattedPos = formatPositionName(assignment.coverageUnit, assignment.coveragePosition, false);
            row.push(formattedPos);
          } else {
            const formattedPos = formatPositionName(assignment.unit, assignment.position, assignment.trainingMatch);
            row.push(formattedPos);
          }
        } else if (staffEndTime && timeSlot === staffEndTime) {
          row.push(getHomeLabel(staffEndTime));
        } else {
          row.push('');
        }
      }
        
      const staffRow = worksheet.addRow(row);
      staffRow.height = 35;  // ✅ Consistent row height
        
      // Apply cell formatting
      for (let col = 2; col <= timeSlots.length + 1; col++) {
        const cell = staffRow.getCell(col);
        const timeSlot = timeSlots[col - 2];
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
          
        if (assignment && assignment.hasBriefing && timeSlot === '09:15') {
          cell.value = 'LODGE BRIEF';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          continue;
        }
          
        if (cell.value === 'BREAK') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        } else if (cell.value && cell.value.toString().startsWith('Home @')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
          cell.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
        } else if (assignment && (assignment.unit || assignment.isCovering)) {
          const displayUnit = assignment.isCovering ? assignment.coverageUnit : assignment.unit;
          const isExplorerUnit = explorerUnits && explorerUnits.includes(displayUnit);
          
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
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
        
      staffRow.getCell(1).font = { bold: true, size: 10 };
      staffRow.getCell(1).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // ✅ Apply Senior Host color highlighting
      if (isSeniorHost(staffName, seniorHostStaff)) {
        staffRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SENIOR_HOST_COLOR }
        };
      }
      staffRow.height = 35;  // ✅ Re-assert height AFTER wrapText formatting
    }
    
    // Spacer between sections
    worksheet.addRow([]);
    worksheet.lastRow.height = 10;
  }
  
  // ========================================================================
  // RETAIL / ADMISSIONS / GHI SECTION
  // ========================================================================
  
  if (retailStaff.length > 0) {
    const retailSectionRow = worksheet.addRow([]);
    const retailSectionCell = retailSectionRow.getCell(1);
    retailSectionCell.value = '🛍️ RETAIL / ADMISSIONS';
    retailSectionCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };  // ✅ Larger font
    retailSectionCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF70AD47' }
    };
    worksheet.mergeCells(`A${retailSectionRow.number}:${String.fromCharCode(64 + timeSlots.length + 1)}${retailSectionRow.number}`);
    retailSectionCell.alignment = { horizontal: 'center', vertical: 'middle' };
    retailSectionRow.height = 25;  // ✅ Taller header
    
    // Header row for retail
    const retailHeaderRow = worksheet.addRow(['STAFF NAME', ...timeSlots]);
    const retailHeaderRowObj = worksheet.getRow(retailHeaderRow.number);
    retailHeaderRowObj.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    retailHeaderRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    retailHeaderRowObj.alignment = { horizontal: 'center', vertical: 'middle' };
    retailHeaderRowObj.height = 18;
    
    // Retail staff rows
    for (const staffName of retailStaff) {
      const row = [staffName];
      const staffEndTime = getStaffEndTime(assignments, staffName);
      
      for (const timeSlot of timeSlots) {
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
        
        if (assignment) {
          if (assignment.isBreak) {
            row.push('BREAK');
          } else if (assignment.isCovering) {
            const formattedPos = formatPositionName(assignment.coverageUnit, assignment.coveragePosition, false);
            row.push(formattedPos);
          } else {
            const formattedPos = formatPositionName(assignment.unit, assignment.position, assignment.trainingMatch);
            row.push(formattedPos);
          }
        } else if (staffEndTime && timeSlot === staffEndTime) {
          row.push(getHomeLabel(staffEndTime));
        } else {
          row.push('');
        }
      }
        
      const staffRow = worksheet.addRow(row);
      staffRow.height = 25;  // ✅ Consistent row height
        
      // Apply cell formatting
      for (let col = 2; col <= timeSlots.length + 1; col++) {
        const cell = staffRow.getCell(col);
        const timeSlot = timeSlots[col - 2];
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
          
        if (assignment && assignment.hasBriefing && timeSlot === '09:15') {
          cell.value = 'MAIN STAGE BRIEF';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          continue;
        }
          
        if (cell.value === 'BREAK') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
        } else if (cell.value && cell.value.toString().startsWith('Home @')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
          cell.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
        } else if (assignment && (assignment.unit || assignment.isCovering)) {
          const displayUnit = assignment.isCovering ? assignment.coverageUnit : assignment.unit;
          const isExplorerUnit = explorerUnits && explorerUnits.includes(displayUnit);
          
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
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
        
      staffRow.getCell(1).font = { bold: true, size: 10 };
      staffRow.getCell(1).border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // ✅ Apply Senior Host color highlighting
      if (isSeniorHost(staffName, seniorHostStaff)) {
        staffRow.getCell(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: SENIOR_HOST_COLOR }
        };
      }
      staffRow.height = 25;  // ✅ Re-assert height AFTER wrapText formatting
    }
  }
  
  
  // ========================================================================
  // UNASSIGNED STAFF SECTION
  // ========================================================================
  
  const unassignedStaff = staffList.filter(s => s.unassigned);
  
  if (unassignedStaff.length > 0) {
    const unassignedHeaderRow = worksheet.addRow([]);
    const unassignedHeader = unassignedHeaderRow.getCell(1);
    unassignedHeader.value = '❌ UNASSIGNED STAFF';
    unassignedHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    unassignedHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFF0000' }
    };
    worksheet.mergeCells(`A${unassignedHeaderRow.number}:G${unassignedHeaderRow.number}`);
    unassignedHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    unassignedHeaderRow.height = 18;
    
    for (const staff of unassignedStaff) {
      const row = [staff.name, `NOT ASSIGNED: ${staff.reason}`];
      const staffRow = worksheet.addRow(row);
      staffRow.height = 25;  // ✅ Consistent row height
      
      staffRow.getCell(1).font = { bold: true, color: { argb: 'FFFF0000' } };
      staffRow.getCell(2).font = { italic: true, color: { argb: 'FFFF0000' } };
      
      staffRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF6666' }
      };
      staffRow.getCell(2).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFF6666' }
      };
      
      worksheet.mergeCells(`B${staffRow.number}:G${staffRow.number}`);
    }
  }
  
  // ========================================================================
  // CAR PARKS & GHI SECTION
  // ========================================================================

  if (carParksGhiStaff.length > 0) {
    const cpSpacer = worksheet.addRow([]);
    cpSpacer.height = 12;
    worksheet.mergeCells(`A${cpSpacer.number}:${String.fromCharCode(64 + timeSlots.length + 1)}${cpSpacer.number}`);

    const cpSectionRow = worksheet.addRow([]);
    const cpSectionCell = cpSectionRow.getCell(1);
    cpSectionCell.value = '🅿️ CAR PARKS & GHI';
    cpSectionCell.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    cpSectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
    worksheet.mergeCells(`A${cpSectionRow.number}:${String.fromCharCode(64 + timeSlots.length + 1)}${cpSectionRow.number}`);
    cpSectionCell.alignment = { horizontal: 'center', vertical: 'middle' };
    cpSectionRow.height = 25;

    const cpHeaderRow = worksheet.addRow(['STAFF NAME', ...timeSlots]);
    const cpHeaderRowObj = worksheet.getRow(cpHeaderRow.number);
    cpHeaderRowObj.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cpHeaderRowObj.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    cpHeaderRowObj.alignment = { horizontal: 'center', vertical: 'middle' };
    cpHeaderRowObj.height = 18;

    for (const staffName of carParksGhiStaff) {
      const row = [staffName];
      const staffEndTime = getStaffEndTime(assignments, staffName);

      for (const timeSlot of timeSlots) {
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);
        if (assignment) {
          if (assignment.isBreak) row.push('BREAK');
          else if (assignment.isCovering) row.push(formatPositionName(assignment.coverageUnit, assignment.coveragePosition, false));
          else row.push(formatPositionName(assignment.unit, assignment.position, assignment.trainingMatch));
        } else if (staffEndTime && timeSlot === staffEndTime) {
          row.push(getHomeLabel(staffEndTime));
        } else {
          row.push('');
        }
      }

      const staffRow = worksheet.addRow(row);
      staffRow.height = 25;

      for (let col = 2; col <= timeSlots.length + 1; col++) {
        const cell = staffRow.getCell(col);
        const timeSlot = timeSlots[col - 2];
        const assignment = findAssignmentAtTime(assignments, staffName, timeSlot);

        if (assignment && assignment.hasBriefing && timeSlot === '09:15') {
          cell.value = 'MAIN STAGE BRIEF';
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          continue;
        }

        if (cell.value === 'BREAK') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
          cell.font = { bold: true, size: 9, color: { argb: 'FF000000' } };
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        } else if (cell.value && cell.value.toString().startsWith('Home @')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
          cell.font = { italic: true, size: 9, color: { argb: 'FF595959' } };
        } else if (assignment && (assignment.unit || assignment.isCovering)) {
          const displayUnit = assignment.isCovering ? assignment.coverageUnit : assignment.unit;
          const rideColor = getRideColor(displayUnit);
          if (rideColor) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rideColor } };
            cell.font = { bold: true, size: 8, color: { argb: 'FF000000' } };
          }
        }

        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      }

      staffRow.getCell(1).font = { bold: true, size: 10 };
      staffRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (isSeniorHost(staffName, seniorHostStaff)) {
        staffRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SENIOR_HOST_COLOR } };
      }
      staffRow.height = 25;
    }
  }

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
  
  worksheet.addRow([]);
  worksheet.lastRow.height = 6;  // ✅ Thin spacer row
  const legendRow = worksheet.addRow(['']);
  legendRow.getCell(1).value = '🎨 Planner separated into RIDES and RETAIL sections | Senior Hosts highlighted in light blue | Colors match Skills Matrix | BREAK = White | BRIEFING = Gold (09:15)';
  legendRow.getCell(1).font = { italic: true, size: 9 };
  legendRow.getCell(1).alignment = { horizontal: 'left', wrapText: true };
  worksheet.mergeCells(legendRow.number, 1, legendRow.number, Math.min(7, timeSlots.length + 1));
  
  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelPlanner };
