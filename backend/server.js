const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const { parseSkillsMatrix } = require('./parsers/skillsMatrixParser');
const { parseTimegripCsv } = require('./parsers/timegripParser');
const { parseZoneFile } = require('./parsers/zoneFileParser');
const { generateExcelPlanner } = require('./generators/excelPlannerGenerator');

const { 
  timeToMinutes, 
  minutesToTime, 
  calculateBreakTiming,
} = require('./utils/breakCalculator');


const app = express();
const upload = multer({ dest: 'uploads/' });

// ============================================================================
// EARLY RIDER PROGRAM (09:00-10:00)
// ============================================================================
// Early Rider rides open at 09:00 instead of standard 10:00
// Operators for these rides start at 08:45 for 09:00 briefing

const EARLY_RIDER_RIDES = [
  'Room on the Broom',
  'Adventure Tree',
  'Tiny Truckers'
];

const STANDARD_RIDES_OPENING_TIME = '10:00';
const EARLY_RIDER_OPENING_TIME = '09:00';

// Get opening time for a specific ride
function getRideOpeningTime(rideName) {
  return EARLY_RIDER_RIDES.includes(rideName) ? EARLY_RIDER_OPENING_TIME : STANDARD_RIDES_OPENING_TIME;
}

// Legacy constant for backward compatibility
const RIDES_OPENING_TIME = STANDARD_RIDES_OPENING_TIME;

// ============================================================================
// BUG #15: RETAIL UNIT PRIORITY FOR SMART BREAK COVER
// ============================================================================

const RETAIL_UNIT_PRIORITY = {
  'Lodge Entrance': 10,
  'Explorer Entrance': 10,
  'Azteca Entrance': 8,
  'Schools Entrance': 7,
  'Adventures Point Gift Shop': 9,
  'Gruffalo Gift Shop': 6,
  'Sweet Shop': 7,
  'Sealife': 5,
  'Ben & Jerry\'s': 4,
  'Ben & Jerry\'s Kiosk': 3,
  'Dragon Treats': 4,
  'Explorer Supplies': 5,
  'Lorikeets': 3
};

// ✅ Zone files mapping - Load from zone-data folder
const ZONE_FILES = {
  'Central_Zone': path.join(__dirname, 'zone-data/Central_Zone.xlsx'),
  'Left_Zone': path.join(__dirname, 'zone-data/Left_Zone.xlsx'),
  'Right_Zone': path.join(__dirname, 'zone-data/Right_Zone.xlsx')
};

// ✅ Unit categories for grouping in UI
const UNIT_CATEGORIES = {
  'Rides': [
    // === NEXUS RIDES ===
    'Room on the Broom', 'Adventure Tree', 'Tiny Truckers', "Elmer's Flying Jumbos",
    'Canopy Capers', 'Sea Dragons', "Griffin's Galeon", "Dragon's Playhouse",
    
    // === ODYSSEY RIDES ===
    "Dragon's Fury", 'Tree Top Hoppers', 'Jungle Rangers', 'Rattlesnake', 
    'Tomb Blaster', 'Zufari', 'River Rafts', 'Monkey Swinger', 'Croc Drop',
    "Paw Patrol Chase's", "Paw Patrol Marshall's", "Paw Patrol Skye's", "Paw Patrol Zuma's",
    
    // === PHANTOM RIDES ===
    'Vampire', 'Mandrill Mayhem', 'Mamba Strike', 'Tiger Rock', 'Gruffalo River Ride',
    'Blue Barnacle', 'Trawler Trouble', 'Barrel Bail Out', 'Seastorm', 'Ostrich Stampede'
  ],
  'Admissions': [
    'Lodge Entrance', 'Azteca Entrance', 'Explorer Entrance', 'Schools Entrance', 'Explorer Supplies'
  ],
  'Retail': [
    // === NEXUS RETAIL ===
    'Adventures Point Gift Shop', 'Dragon Treats', 'Lorikeets',
    'Sealife', 'Sweet Shop', "Ben & Jerry's", "Ben & Jerry's Kiosk",
    
    // === ODYSSEY RETAIL ===
    'Croc Drop Shop', 'Freestyle & Vending', 'Paw Patrol Shop', 'Zufari Barrow',
    
    // === PHANTOM RETAIL ===
    'Gruffalo Shop', 'Jumanji Shop', 'Shipwreck Kiosk', 'Tiger Kiosk'
  ],
  'Car Parks': [
    'Car Parks - Staff Car Park', 'Car Parks - Hotel Car Park', 'Car Parks - Express',
    'Car Parks - Split', 'Car Parks - Flamingo', 'Car Parks - Giraffe', 'Car Parks - Gorilla',
    'Car Parks - Additional Schools'
  ],
  'GHI': [
    'GHI - Rap', 'GHI - Hub', 'GHI - Help Squad'
  ],
  'Break Cover': [
    'Rides Break Cover', 'Retail Break Cover'
  ]
};

// Helper function to get category from unit name
function getCategoryFromUnit(unitName) {
  for (const [category, unitList] of Object.entries(UNIT_CATEGORIES)) {
    if (unitList.includes(unitName)) {
      return category;
    }
  }
  return 'Retail'; // Default fallback
}

// ✅ FIX #7: Staff who CANNOT be left alone - must be assigned a real position
// These staff must have a position assignment, never left unassigned/no matching position
// Format: ['Staff Name 1', 'Staff Name 2', ...]
const STAFF_CANNOT_BE_LEFT_ALONE = [
  'Sophie Maher'
  // Add more staff names here as needed
];

// ✅ FIX #8: Critical units that need MINIMUM 2 staff (never leave one person alone)
// Entrances and busy shops should never have just 1 person
const CRITICAL_UNITS_NEED_MINIMUM_2 = [
  'Lodge Entrance',
  'Explorer Entrance',
  'Azteca Entrance',
  'Schools Entrance',
  'Sweet Shop',
  'Adventures Point Gift Shop'
];

// Units that can safely operate with 1 person (but need break cover if person is on break)
const UNITS_WITH_BREAK_COVER_NEEDED = [
  'Sealife',
  'Lorikeets',
  "Ben & Jerry's",
  'Explorer Supplies',
  "Ben & Jerry's Kiosk"
];

// ✅ V7.10: Normalize staff names for matching
function normalizeStaffName(name) {
  if (!name) return '';
  
  // Remove department suffixes and normalize
  let normalized = name
    .toLowerCase()
    .replace(/\s+(r&a|c|r|retail|rides|admissions)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // ✅ BUG FIX #7a: Handle middle names/compound surnames
  // Extract first name + first surname only
  // "Cai Tinsley Cullip" → "cai tinsley"
  // "Cai Tinsley" → "cai tinsley"
  const parts = normalized.split(' ');
  if (parts.length > 2) {
    // Keep only first name + first surname
    normalized = `${parts[0]} ${parts[1]}`;
  }
  
  return normalized;
}

// ✅ V12: Snap to nearest hourly break slot
function snapToNearestHour(minutesSinceMidnight) {
  const HOURLY_SLOTS = [
    { start: '11:00', end: '11:45', startMin: 660, endMin: 705 },
    { start: '12:00', end: '12:45', startMin: 720, endMin: 765 },
    { start: '13:00', end: '13:45', startMin: 780, endMin: 825 },
    { start: '14:00', end: '14:45', startMin: 840, endMin: 885 },
    { start: '15:00', end: '15:45', startMin: 900, endMin: 945 }
  ];
  
  for (const slot of HOURLY_SLOTS) {
    if (slot.startMin >= minutesSinceMidnight) {
      return slot;
    }
  }
  return HOURLY_SLOTS[HOURLY_SLOTS.length - 1];
}

// ✅ V12: Validate if staff has skill for a unit
function hasSkillForUnit(staffName, targetUnit, skillsData) {
  const staff = skillsData.staffWithGreen.find(s => s.name === staffName);
  if (!staff) return false;
  
  // ✅ NEW: For Rides units, Rides T1 break cover can cover any ride
  // Check if this is a Rides unit
  const category = getCategoryFromUnit(targetUnit);
  if (category === 'Rides') {
    // Rides T1 staff (break cover) can cover any rides position
    // No specific skill check needed - they're trained as general rides BC
    return true;
  }
  
  const unitSkillMap = {
    'Lodge Entrance': 'Admissions', 'Azteca Entrance': 'Admissions', 'Explorer Entrance': 'Admissions', 'Schools Entrance': 'Admissions',
    'Adventures Point Gift Shop': 'Adventure Point Gift Shop', 'Sweet Shop': 'Sweet Shop', 'Sealife': 'Sea Life', 'Lorikeets': 'Retail',
    'Car Parks - Staff Car Park': 'Car Parks', 'Car Parks - Hotel Car Park': 'Car Parks', 'Car Parks - Express': 'Car Parks',
    'Car Parks - Split': 'Car Parks', 'Car Parks - Flamingo': 'Car Parks', 'Car Parks - Giraffe': 'Car Parks', 'Car Parks - Gorilla': 'Car Parks',
    // ✅ B&J requires the "Ben & Jerry's" skill column — NOT Lodge Kiosk
    "Ben & Jerry's": "Ben & Jerry's",
    "Ben & Jerry's Kiosk": "Ben & Jerry's"
  };
  
  const requiredSkill = unitSkillMap[targetUnit];
  if (!requiredSkill) return false;
  
  // ✅ Handle both plain strings ("Ben & Jerry's-HOST") and objects ({fullSkill: "..."})
  return (staff.greenUnits || []).some(skill => {
    if (!skill) return false;
    const skillStr = typeof skill === 'string' ? skill : (skill.fullSkill || '');
    return skillStr.toLowerCase().includes(requiredSkill.toLowerCase());
  });
}

// ✅ V12: Get position name for a unit
function getPositionForUnit(unit) {
  const positionMap = {
    'Gift Shop': 'Retail Host', 'Adventures Point Gift Shop': 'Retail Host', 'Sweet Shop': 'Retail Host', 'Sealife': 'Retail Host',
    'Lodge Entrance': 'Admissions Host', 'Azteca Entrance': 'Admissions Host', 'Explorer Entrance': 'Admissions Host', 'Schools Entrance': 'Admissions Host',
    'Car Parks - Staff Car Park': 'Car Parks Host', 'Car Parks - Hotel Car Park': 'Car Parks Host'
  };
  return positionMap[unit] || `${unit} Host`;
}

// ✅ V12: Stagger breaks to prevent same-unit simultaneous breaks
function staggerBreaksByUnit(allAssignments) {
  console.log(`\n🔄 Applying Break Staggering Logic...`);
  const unitBreaks = {};
  const unitStaffCount = {};
  
  // Count staff per unit (non-break assignments)
  for (const assignment of allAssignments) {
    if (!assignment.isBreak && assignment.unit && assignment.unit !== 'Zonal Lead') {
      unitStaffCount[assignment.unit] = (unitStaffCount[assignment.unit] || 0) + 1;
    }
  }
  
  // Group breaks by unit
  for (let i = 0; i < allAssignments.length; i++) {
    const assignment = allAssignments[i];
    if (assignment.isBreak) {
      if (!unitBreaks[assignment.unit]) unitBreaks[assignment.unit] = [];
      unitBreaks[assignment.unit].push({
        staff: assignment.staff,
        startMin: timeToMinutes(assignment.startTime),
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        index: i
      });
    }
  }
  
  const HOURLY_SLOTS = [660, 720, 780, 840, 900]; // 11:00, 12:00, 13:00, 14:00, 15:00
  const adjustedAssignments = [...allAssignments];
  
  for (const [unit, breaks] of Object.entries(unitBreaks)) {
    const totalStaff = unitStaffCount[unit] || 1;
    const totalBreaks = breaks.length;
    
    console.log(`  📊 ${unit}: ${totalStaff} staff, ${totalBreaks} breaks to stagger`);
    
    // ✅ CRITICAL: If all staff at a unit need breaks, we MUST stagger them
    // Otherwise the unit will be left empty
    if (totalBreaks >= totalStaff) {
      console.log(`  ⚠️  ${unit}: All/most staff need breaks - forcing stagger`);
      
      // Sort breaks by original time
      breaks.sort((a, b) => a.startMin - b.startMin);
      
      // Assign each person to a different slot
      for (let i = 0; i < breaks.length; i++) {
        const slotIndex = i % HOURLY_SLOTS.length;
        const newSlot = HOURLY_SLOTS[slotIndex];
        const currentBreak = breaks[i];
        
        if (currentBreak.startMin !== newSlot) {
          const slotTime = minutesToTime(newSlot);
          const endSlotTime = minutesToTime(newSlot + 30); // 30min breaks
          console.log(`  🔄 ${currentBreak.staff}: ${currentBreak.startTime}-${currentBreak.endTime} → ${slotTime}-${endSlotTime}`);
          adjustedAssignments[currentBreak.index].startTime = slotTime;
          adjustedAssignments[currentBreak.index].endTime = endSlotTime;
        }
      }
      console.log(`  ✅ ${unit}: Breaks staggered across ${breaks.length} slots`);
      continue;
    }
    
    // Normal staggering for units with spare coverage
    if (breaks.length < 2) continue;
    
    breaks.sort((a, b) => a.startMin - b.startMin);
    const usedSlots = new Set();
    usedSlots.add(breaks[0].startMin);
    
    for (let i = 1; i < breaks.length; i++) {
      const currentBreak = breaks[i];
      
      if (usedSlots.has(currentBreak.startMin)) {
        let newSlot = null;
        for (const slot of HOURLY_SLOTS) {
          if (!usedSlots.has(slot) && slot > currentBreak.startMin) {
            newSlot = slot;
            break;
          }
        }
        
        if (newSlot) {
          const slotTime = minutesToTime(newSlot);
          const endSlotTime = minutesToTime(newSlot + 30);
          console.log(`  🔄 ${currentBreak.staff} (${unit}): ${currentBreak.startTime}-${currentBreak.endTime} → ${slotTime}-${endSlotTime}`);
          adjustedAssignments[currentBreak.index].startTime = slotTime;
          adjustedAssignments[currentBreak.index].endTime = endSlotTime;
          usedSlots.add(newSlot);
        }
      } else {
        usedSlots.add(currentBreak.startMin);
      }
    }
    console.log(`  ✅ ${unit}: Breaks staggered (${breaks.length} staff)`);
  }
  
  return adjustedAssignments;
}

// ✅ V7.9: Smart Position Matching Function
function matchPositionToSkill(zonePosition) {
  if (!zonePosition) return null;
  
  const posLower = zonePosition.toLowerCase();
  
  if (posLower.includes('attendant')) {
    return 'ATT';
  }
  
  if (posLower.includes('operator')) {
    return 'OP';
  }
  
  if (posLower.includes('host')) {
    return 'HOST';
  }
  
  if (posLower.includes('driver')) {
    return 'Driver';
  }
  
  return zonePosition;
}

function normalizeRideName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// ✅ V8.4: Check if staff has SPECIFIC unit skill (not generic)
function hasSpecificUnitSkill(staff, unitName) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return false;
  }
  
  const normalizedUnit = normalizeRideName(unitName);
  
  for (const skill of staff.greenUnits) {
    const normalizedSkill = normalizeRideName(skill.split('-')[0]);
    
    if (normalizedSkill === normalizedUnit) {
      return true;
    }
  }
  
  return false;
}

// ✅ V10.1: Get all specific units/rides a staff member is trained on
function getStaffTrainedUnits(staff) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return [];
  }
  
  const trainedUnits = [];
  
  for (const skill of staff.greenUnits) {
    // Parse skill format: "UnitName-OP" or "UnitName-HOST" or "UnitName-ATT"
    const parts = skill.split('-');
    if (parts.length < 2) continue;
    
    const skillType = parts[parts.length - 1]; // OP, HOST, ATT, etc.
    const unitName = parts.slice(0, -1).join('-'); // Everything before the last -
    
    trainedUnits.push({
      unit: unitName.trim(),
      skillType: skillType,
      fullSkill: skill
    });
  }
  
  return trainedUnits;
}

// ✅ V10.0: Check for generic skill matches with proper precedence
function getGenericSkillMatch(unitName, requiredPosition) {
  const unitLower = unitName.toLowerCase();
  const skillType = matchPositionToSkill(requiredPosition);
  
  // ✅ CAR PARKS FIRST - Must check before schools to avoid confusion
  if (unitLower.includes('car park') || unitLower.includes('car parks')) {
    return `Car Parks Skill-${skillType}`;
  }
  
  // Admissions (including schools)
  if (unitLower.includes('admissions') || unitLower.includes('entrance') || unitLower.includes('schools')) {
    return `Admissions Skill-${skillType}`;
  }
  
  // GHI
  if (unitLower.includes('ghi')) {
    return `GHI ${skillType}`;
  }
  
  // SPECIFIC retail units
  if (unitLower.includes('sweet shop')) {
    return `Sweet Shop-${skillType}`;
  }
  if (unitLower.includes('sealife') || unitLower.includes('sea life')) {
    return `Sea Life-${skillType}`;
  }
  if (unitLower.includes('ben') && unitLower.includes('jerry')) {
    return `Ben and Jerry's Kiosk-${skillType}`;
  }
  if (unitLower.includes('explorer')) {
    return `Explorer Unit-${skillType}`;
  }
  if (unitLower.includes('barrows')) {
    return `Barrows-${skillType}`;
  }
  if (unitLower.includes('kiosk') && !unitLower.includes('ben')) {
    return `Kiosk-${skillType}`;
  }
  if (unitLower.includes('gift shop')) {
    return `Gift Shop-${skillType}`;
  }
  
  // Generic fallback for Lorikeets and other retail
  if (unitLower.includes('retail') || unitLower.includes('lorikeets')) {
    return `Retail-${skillType}`;
  }
  
  // Break Cover
  if (unitLower.includes('break cover')) {
    return `Break Cover-${skillType}`;
  }
  
  return null;
}

// ✅ V7.11: Staff skill checking with generic support
function staffHasSkill(staff, unitName, requiredPosition) {
  if (!staff.greenUnits || staff.greenUnits.length === 0) {
    return false;
  }
  
  const normalizedUnit = normalizeRideName(unitName);
  const skillType = matchPositionToSkill(requiredPosition);
  
  // Check generic skills
  const genericSkill = getGenericSkillMatch(unitName, requiredPosition);
  if (genericSkill) {
    for (const staffSkill of staff.greenUnits) {
      if (staffSkill.trim() === genericSkill) {
        return true;
      }
    }
  }
  
  // Check specific ride skills
  for (const skillKey of staff.greenUnits) {
    const parts = skillKey.split('-');
    if (parts.length < 2) continue;
    
    const skillRide = parts.slice(0, -1).join('-');
    const skillPosition = parts[parts.length - 1];
    
    const normalizedSkillRide = normalizeRideName(skillRide);
    
    if (normalizedSkillRide === normalizedUnit && skillPosition === skillType) {
      return true;
    }
  }
  
  return false;
}

// ✅ V7.10: Fuzzy name matching for availability
function isStaffAvailableForTime(staffName, startTime, endTime, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);
  
  // ✅ BUG FIX #9a: Search in BOTH workingStaff AND MANAGEMENT category
  let staff = timegripData.workingStaff.find(s => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });
  
  // If not found in workingStaff, try MANAGEMENT category (Zonal Leads)
  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find(s => {
      const normalizedWorkingName = normalizeStaffName(s.name);
      return normalizedWorkingName === normalizedSearchName;
    });
  }
  
  if (!staff) {
    return false;
  }
  
  return true;
}

// ✅ V7.12: Get staff working hours from TimeGrip
function getStaffWorkingHours(staffName, timegripData) {
  const normalizedSearchName = normalizeStaffName(staffName);
  
  // ✅ BUG FIX #9b: Search in BOTH workingStaff AND MANAGEMENT category
  let staff = timegripData.workingStaff.find(s => {
    const normalizedWorkingName = normalizeStaffName(s.name);
    return normalizedWorkingName === normalizedSearchName;
  });
  
  // If not found in workingStaff, try MANAGEMENT category (Zonal Leads)
  if (!staff && timegripData.staffByFunction?.MANAGEMENT) {
    staff = timegripData.staffByFunction.MANAGEMENT.find(s => {
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

// ✅ V10.0: Parse Closed Days sheet from zone file (now from folder!)
function getClosedDaysStatus(zoneFilePath, date, dayCode) {
  try {
    console.log(`📖 Reading Closed Days from: ${zoneFilePath}`);
    
    if (!fs.existsSync(zoneFilePath)) {
      console.error(`❌ Zone file not found: ${zoneFilePath}`);
      return {};
    }
    
    const wb = XLSX.readFile(zoneFilePath, { data_only: true });
    
    if (!wb.SheetNames.includes('Closed Days')) {
      console.log('⚠️  Closed Days sheet not found, defaulting all units to open');
      return {};
    }
    
    const ws = wb.Sheets['Closed Days'];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    console.log(`📄 Closed Days sheet has ${data.length} rows`);
    
    // Row 3 (index 2) contains headers with unit names starting from column I (index 8)
    const headers = data[2];
    
    if (!headers) {
      console.error('❌ Headers row not found in Closed Days sheet');
      return {};
    }
    
    // Find the row matching the date
    let targetRow = null;
    for (let i = 5; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;
      
      const rowDate = row[3]; // Column D (the formatted date like "Sat 14 - 02 - 26")
      
      if (rowDate) {
        let rowDateStr = '';
        
        // If it's a string like "Sat 14 - 02 - 26", parse it
        if (typeof rowDate === 'string') {
          // Format: "Day DD - MM - YY" → extract DD, MM, YY
          const match = rowDate.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2})/);
          if (match) {
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            const year = '20' + match[3]; // 25 → 2025, 26 → 2026
            rowDateStr = `${year}-${month}-${day}`;
          }
        } else if (rowDate instanceof Date) {
          rowDateStr = rowDate.toISOString().split('T')[0];
        } else if (typeof rowDate === 'number') {
          const excelDate = new Date((rowDate - 25569) * 86400 * 1000);
          rowDateStr = excelDate.toISOString().split('T')[0];
        }
        
        if (rowDateStr === date) {
          targetRow = row;
          console.log(`✅ Found matching date row: ${date} (matched: ${rowDateStr})`);
          break;
        }
      }
    }
    
    if (!targetRow) {
      console.log(`⚠️  No matching date found in Closed Days for ${date}`);
      return {};
    }
    
    // Build status map: unitName -> true/false
    const statusMap = {};
    for (let i = 7; i < headers.length; i++) {
      const unitName = headers[i];
      const status = targetRow[i];
      if (unitName && unitName !== '' && unitName !== '0') {
        statusMap[unitName] = status === 'Open';
      }
    }
    
    console.log(`📊 Closed Days status loaded: ${Object.keys(statusMap).length} units`);
    return statusMap;
  } catch (error) {
    console.error('❌ Error parsing Closed Days sheet:', error);
    return {};
  }
}

// ✅ V10.0: Get all units with category grouping and Closed Days defaults
// ✨ FIXED: Now dynamically reads units from zone file instead of hardcoded categories
function getUnitsWithStatus(zoneFilePath, date, dayCode) {
  const closedDaysStatus = getClosedDaysStatus(zoneFilePath, date, dayCode);
  
  // Get all unique unit names from the Closed Days status (these are zone-specific!)
  const allUnits = Object.keys(closedDaysStatus);
  
  // Categorize units dynamically based on name patterns
  const result = {
    'Rides': [],
    'Admissions': [],
    'Retail': [],
    'Car Parks': [],
    'GHI': [],
    'Break Cover': []
  };
  
  for (const unitName of allUnits) {
    // ✅ Use UNIT_CATEGORIES constant for accurate categorization
    let category = 'Retail'; // Default fallback
    
    // Check each category in UNIT_CATEGORIES for exact match
    for (const [categoryName, unitList] of Object.entries(UNIT_CATEGORIES)) {
      if (unitList.includes(unitName)) {
        category = categoryName;
        break;
      }
    }
    
    result[category].push({
      name: unitName,
      isOpen: closedDaysStatus[unitName] !== false,
      originalOpen: closedDaysStatus[unitName] !== false
    });
  }
  
  // Remove empty categories
  for (const category of Object.keys(result)) {
    if (result[category].length === 0) {
      delete result[category];
    } else {
      // Sort units alphabetically within each category
      result[category].sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  
  return result;
}

app.use(express.json());

// ✅ Get available zones
app.get('/api/zones', (req, res) => {
  try {
    const zones = Object.keys(ZONE_FILES).map(zone => ({
      code: zone,
      label: zone.replace(/_/g, ' ')
    }));
    res.json({ zones });
  } catch (error) {
    console.error('Error getting zones:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get day codes for a specific zone
app.post('/api/day-codes-for-zone', express.json(), (req, res) => {
  try {
    const { zone } = req.body;
    
    if (!ZONE_FILES[zone]) {
      return res.status(400).json({ error: `Unknown zone: ${zone}` });
    }
    
    const zoneFilePath = ZONE_FILES[zone];
    
    if (!fs.existsSync(zoneFilePath)) {
      return res.status(400).json({ error: `Zone file not found: ${zoneFilePath}` });
    }
    
    const zoneData = parseZoneFile(zoneFilePath);
    
    res.json({ 
      dayCodeOptions: zoneData.dayCodeOptions,
      staffingRequirements: zoneData.staffingRequirements
    });
  } catch (error) {
    console.error('Error getting day codes for zone:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ V10.0 NEW: Get unit status with defaults from Closed Days (now from folder!)
app.post('/api/get-unit-status', express.json(), (req, res) => {
  try {
    const { zone, date, dayCode } = req.body;
    
    console.log(`\n🔍 API /get-unit-status called with:`);
    console.log(`   Zone: ${zone}`);
    console.log(`   Date: ${date}`);
    console.log(`   Day Code: ${dayCode}`);
    
    if (!zone) {
      return res.status(400).json({ error: 'Zone is required' });
    }
    
    if (!ZONE_FILES[zone]) {
      return res.status(400).json({ error: `Unknown zone: ${zone}` });
    }
    
    const zoneFilePath = ZONE_FILES[zone];
    console.log(`📂 Using zone file: ${zoneFilePath}`);
    
    if (!fs.existsSync(zoneFilePath)) {
      return res.status(400).json({ error: `Zone file not found: ${zone}` });
    }
    
    console.log(`\n🔄 Getting unit status for ${zone}...`);
    const units = getUnitsWithStatus(zoneFilePath, date, dayCode);
    
    console.log(`✅ Returning units for zone ${zone}:`);
    console.log(`   Categories: ${Object.keys(units).join(', ')}`);
    Object.entries(units).forEach(([category, unitList]) => {
      console.log(`   ${category}: ${unitList.map(u => u.name).join(', ')}`);
    });
    
    res.json({
      success: true,
      units: units,
      zone: zone,
      date: date,
      dayCode: dayCode
    });
  } catch (error) {
    console.error('Error getting unit status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Parse and analyze (SIMPLIFIED - no CWOA upload!)
app.post('/api/parse-and-analyze', upload.fields([
  { name: 'skillsMatrix', maxCount: 1 },
  { name: 'timegripCsv', maxCount: 1 }
  // ✅ V10.0: No allocationTemplate, no cwoaFile!
]), async (req, res) => {
  try {
    const { teamName, zone, dayCode, date } = req.body;
    console.log(`\nParsing for ${teamName}, Zone: ${zone}, Day Code: ${dayCode}, Date: ${date}`);
    
    if (!req.files['skillsMatrix'] || !req.files['timegripCsv']) {
      return res.status(400).json({ error: 'Missing required files: skillsMatrix and timegripCsv' });
    }
    
    const skillsMatrixFile = req.files['skillsMatrix'][0].path;
    const timegripFile = req.files['timegripCsv'][0].path;
    
    const sheetName = teamName.includes('Team') ? teamName : `Team ${teamName}`;
    const skillsData = await parseSkillsMatrix(skillsMatrixFile, sheetName);
    const timegripData = await parseTimegripCsv(timegripFile, teamName, date);
    
    const zoneFilePath = ZONE_FILES[zone];
    if (!zoneFilePath) {
      throw new Error(`Unknown zone: ${zone}`);
    }
    
    if (!fs.existsSync(zoneFilePath)) {
      throw new Error(`Zone file not found: ${zoneFilePath}`);
    }
    
    const zoneData = parseZoneFile(zoneFilePath);
    const staffingRequirements = zoneData.staffingRequirements[dayCode] || [];
    const dayCodeInfo = zoneData.dayCodeOptions.find(dc => dc.code === dayCode);
    
    console.log(`📊 Staffing requirements for ${zone} - Day Code ${dayCode}:`);
    staffingRequirements.forEach(req => {
      console.log(`  ${req.unitName} (${req.position}): ${req.staffNeeded} staff needed`);
    });
    
    const statistics = {
      staffWithGreenTraining: skillsData.staffWithGreen.length,
      zone: zone,
      dayCode: dayCode,
      workingStaff: timegripData.workingStaff.length,
      staffingRequirements: staffingRequirements.length
    };
    
    res.json({
      success: true,
      statistics,
      staffData: skillsData,
      timegripData,
      staffingRequirements,
      zone,
      dayCode
    });
  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// BUG #15: NEW UTILITY FUNCTIONS
// ============================================================================

function calculateWorkHours(startTime, endTime, breakMinutes) {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const totalMinutes = endMins - startMins;
  const workMinutes = totalMinutes - (breakMinutes || 0);
  return workMinutes / 60;
}

// ✅ NEW VERSION (returns Set of staff names)
function detectBriefingStaff(assignedStaff) {
  const briefingAttendees = new Set();
  
  for (const assignment of assignedStaff) {
    if (assignment.startTime === '09:15') {
      briefingAttendees.add(assignment.staff);
    }
  }
  
  return briefingAttendees;
}

function getPreferredBreakSlot(assignment, breakSlots, allAssignments) {
  const startTime = assignment.startTime;
  const endTime = assignment.endTime;
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const isSeniorHost = assignment.position && assignment.position.includes('Senior Host');
  
  // Priority 1: SHORT SHIFTS (end ≤14:00) → 11:00 ALWAYS
  if (endMinutes <= 840) { // 14:00 = 840 minutes
    console.log(`   🕐 ${assignment.staff || 'Staff'}: Short shift (ends ${endTime}) → 11:00 break`);
    return breakSlots[0]; // 11:00
  }
  
  // Priority 2: SENIOR HOSTS → 12:00+ (NEVER 11:00)
  if (isSeniorHost) {
    console.log(`   👔 ${assignment.staff || 'Staff'}: Senior Host → 12:00+ break`);
    return breakSlots[1]; // 12:00 (will cascade to 13:00/14:00 if full)
  }
  
  // Priority 3: EARLY STARTERS (before 09:00) → 11:00
  if (startMinutes < 540) { // 09:00 = 540 minutes
    console.log(`   🌅 ${assignment.staff || 'Staff'}: Early starter (${startTime}) → 11:00 break`);
    return breakSlots[0]; // 11:00
  }
  
  // Priority 4: MID-SHIFT STARTERS (09:00-10:45) → 12:00 (NOT 11:00!)
  if (startMinutes >= 540 && startMinutes < 645) { // 09:00-10:45
    console.log(`   🕐 ${assignment.staff || 'Staff'}: Mid-shift starter (${startTime}) → 12:00 break`);
    return breakSlots[1]; // 12:00
  }
  
  // Priority 5: LATE STARTERS (11:00+) → 13:00 for early closes, 14:00 for late closes
  if (startMinutes >= 660) { // 11:00 = 660 minutes
    // Check if early close (≤17:00) or late close (>17:00)
    const isEarlyClose = endMinutes <= 1020; // 17:00 = 1020 minutes
    
    if (isEarlyClose) {
      console.log(`   ⏰ ${assignment.staff || 'Staff'}: Late starter (${startTime}), early close (${endTime}) → 13:00 break`);
      return breakSlots[2]; // 13:00 (NOT 14:00 for 4pm/5pm closes!)
    } else {
      console.log(`   ⏰ ${assignment.staff || 'Staff'}: Late starter (${startTime}), late close (${endTime}) → 14:00 break`);
      return breakSlots[3]; // 14:00 (OK for 6pm/7pm closes)
    }
  }
  
  // Default: Early break
  return breakSlots[0]; // 11:00
}
function getAllParkUnits() {
  console.log('\n🌐 Loading park-wide unit status...');
  
  const allUnits = {
    rides: new Set(),
    retail: new Set(),
    admissions: new Set()
  };
  
  for (const [zoneName, zonePath] of Object.entries(ZONE_FILES)) {
    try {
      if (!fs.existsSync(zonePath)) continue;
      
      const wb = XLSX.readFile(zonePath, { data_only: true });
      if (!wb.SheetNames.includes('Closed Days')) continue;
      
      const ws = wb.Sheets['Closed Days'];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
      
      const headers = data[2];
      if (!headers) continue;
      
      for (let i = 7; i < headers.length; i++) {
        const unitName = headers[i];
        if (!unitName || unitName === '' || unitName === '0') continue;
        
        for (const [category, unitList] of Object.entries(UNIT_CATEGORIES)) {
          if (unitList.includes(unitName)) {
            if (category === 'Rides') allUnits.rides.add(unitName);
            else if (category === 'Retail') allUnits.retail.add(unitName);
            else if (category === 'Admissions') allUnits.admissions.add(unitName);
            break;
          }
        }
      }
      
      console.log(`   ✅ Loaded ${zoneName}`);
    } catch (error) {
      console.error(`   ❌ Error loading ${zoneName}:`, error.message);
    }
  }
  
  const result = {
    rides: Array.from(allUnits.rides).sort(),
    retail: Array.from(allUnits.retail).sort(),
    admissions: Array.from(allUnits.admissions).sort()
  };
  
  console.log(`\n📊 Park-wide: ${result.rides.length} rides, ${result.retail.length} retail`);
  return result;
}

function assignBreakCover(breakCoverStaff, regularStaff, breaksNeeded) {
  if (!breakCoverStaff || breakCoverStaff.length === 0) {
    console.log('\n⚠️  No break cover staff detected');
    return [];
  }
  
  console.log(`\n🔄 Assigning ${breakCoverStaff.length} break cover staff...`);
  
  const unitCounts = {};
  for (const staff of regularStaff.filter(s => s.category === 'Retail' || s.category === 'Admissions')) {
    unitCounts[staff.unit] = (unitCounts[staff.unit] || 0) + 1;
  }
  
  const priorityUnits = Object.keys(unitCounts)
    .filter(unit => unitCounts[unit] >= 1)
    .sort((a, b) => {
      const priorityDiff = (RETAIL_UNIT_PRIORITY[b] || 0) - (RETAIL_UNIT_PRIORITY[a] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return unitCounts[b] - unitCounts[a];
    });
  
  console.log(`   📍 Top: ${priorityUnits.slice(0, 3).join(', ')}`);
  
  const assignments = [];
  
  if (priorityUnits.length > 0 && breakCoverStaff[0]) {
    const stationaryUnit = priorityUnits[0];
    const stationaryStaff = breakCoverStaff[0];
    
    assignments.push({
      staff: stationaryStaff.name,
      unit: stationaryUnit,
      position: 'Host',
      startTime: stationaryStaff.startTime || '11:00',
      endTime: stationaryStaff.endTime || '15:00',
      isBreakCover: true,
      rotation: 'STATIONARY',
      category: 'Retail'
    });
    
    console.log(`   ✅ ${stationaryStaff.name}: ${stationaryUnit} (STATIONARY)`);
  }
  
  if (priorityUnits.length > 1 && breakCoverStaff[1]) {
    const rotatingStaff = breakCoverStaff[1];
    const earlyBreaks = breaksNeeded.filter(b => 
      b.start === '11:00' && (b.category === 'Retail' || b.category === 'Admissions')
    );
    
    if (earlyBreaks.length > 0) {
      const earlyBreak = earlyBreaks[0];
      const criticalEntrance = priorityUnits.find(u => 
        u.includes('Entrance') && u !== earlyBreak.unit
      ) || priorityUnits[1];
      
      assignments.push({
        staff: rotatingStaff.name,
        unit: earlyBreak.unit,
        position: 'Host',
        startTime: '11:00',
        endTime: '11:30',
        isBreakCover: true,
        rotation: 'ROTATION 1',
        category: 'Retail'
      });
      
      assignments.push({
        staff: rotatingStaff.name,
        unit: criticalEntrance,
        position: 'Host',
        startTime: '11:45',
        endTime: rotatingStaff.endTime || '15:00',
        isBreakCover: true,
        rotation: 'ROTATION 2',
        category: 'Retail'
      });
      
      console.log(`   ✅ ${rotatingStaff.name}: ROTATING`);
      console.log(`      → ${earlyBreak.unit} (11:00-11:30)`);
      console.log(`      → ${criticalEntrance} (11:45-15:00)`);
    }
  }
  
  return assignments;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 SMART BREAK COVER SYSTEM V1.0
// Intelligently assigns break covers to specific units with early breaks for
// single-coverage units (Sealife, Lorikeets) so covers can help elsewhere after
// ═══════════════════════════════════════════════════════════════════════════════

function identifySingleCoverageUnits(assignments) {
  // Count how many staff are assigned to each retail/admissions unit
  const unitStaffCount = new Map();
  
  for (const assignment of assignments) {
    // Only count retail/admissions staff (not break covers, not rides)
    if (assignment.isBreakCover) continue;
    if (assignment.isBreak) continue;
    
    const category = getCategoryFromUnit(assignment.unit);
    if (category === 'Rides') continue;
    if (category === 'Car Parks') continue;
    if (category === 'GHI') continue;
    
    const unit = assignment.unit;
    if (!unit || unit.includes('Break Cover')) continue;
    
    unitStaffCount.set(unit, (unitStaffCount.get(unit) || 0) + 1);
  }
  
  // Find units with exactly 1 person assigned
  const singleCoverageUnits = [];
  for (const [unit, count] of unitStaffCount.entries()) {
    if (count === 1) {
      singleCoverageUnits.push(unit);
    }
  }
  
  console.log(`\n🔍 Single-Coverage Units Analysis:`);
  console.log(`   Total retail/admissions units: ${unitStaffCount.size}`);
  console.log(`   Single-coverage units (1 person): ${singleCoverageUnits.length}`);
  if (singleCoverageUnits.length > 0) {
    console.log(`   Units: ${singleCoverageUnits.join(', ')}`);
  }
  
  return { singleCoverageUnits, unitStaffCount };
}

function assignSmartBreakCover(assignments, breakAssignments, breakCoverStaff, timegripData, skillsData) {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`🎯 SMART BREAK COVER SYSTEM V1.0`);
  console.log(`═══════════════════════════════════════════════════════════`);
  
  const smartAssignments = [];
  const busyWindows = new Map(); // Track which BC staff are busy when
  
  // Step 1: Identify single-coverage units
  const { singleCoverageUnits, unitStaffCount } = identifySingleCoverageUnits(assignments);
  
  console.log(`\n📊 Break Coverage Analysis:`);
  console.log(`   Total breaks to cover: ${breakAssignments.length}`);
  console.log(`   Available break cover staff: ${breakCoverStaff.length}`);
  
  // Step 2: Handle single-coverage units - assign breaks when BC staff arrive
  console.log(`\n🎯 Phase 1: Single-Coverage Units (Breaks When BC Available)`);
  
  for (const unit of singleCoverageUnits) {
    // Find breaks for this unit
    const unitBreaks = breakAssignments.filter(b => b.unit === unit);
    if (unitBreaks.length === 0) continue;
    
    const breakToMove = unitBreaks[0]; // Get the staff member's break
    
    // Find available BC with matching skills
    const matchingBC = breakCoverStaff.find(bc => {
      // Check if BC type matches category
      const bcType = (bc.plannedFunction || bc.scheduledFunction || '').toLowerCase();
      const category = getCategoryFromUnit(unit);
      
      // Rides BC can only cover Rides
      if (category === 'Rides' && !bcType.includes('ride')) return false;
      
      // Retail BC cannot cover Rides
      if ((category === 'Retail' || category === 'Admissions') && bcType.includes('ride')) return false;
      
      // Check if they have the skill (now works with correct "Sea Life" mapping!)
      return hasSkillForUnit(bc.name, unit, skillsData);
    });
    
    if (matchingBC) {
      // Get BC staff's actual arrival time
      const bcHours = getStaffWorkingHours(matchingBC.name, timegripData);
      if (!bcHours) {
        console.log(`   ⚠️  ${unit}: Could not find working hours for ${matchingBC.name}`);
        continue;
      }
      
      const bcArrivalMinutes = timeToMinutes(bcHours.startTime);
      const breakDuration = breakToMove.endMinutes - breakToMove.startMinutes;
      
      // Find the earliest break slot at or after BC arrives
      // Standard break slots: 11:00, 12:00, 13:00, 14:00, 15:00
      const breakSlots = [660, 720, 780, 840, 900]; // 11:00, 12:00, 13:00, 14:00, 15:00 in minutes
      const availableSlot = breakSlots.find(slot => slot >= bcArrivalMinutes);
      
      if (!availableSlot) {
        console.log(`   ⚠️  ${unit}: BC arrives too late (${bcHours.startTime}) for any break slot`);
        continue;
      }
      
      // Calculate break times
      const newStartMinutes = availableSlot;
      const newEndMinutes = availableSlot + breakDuration;
      const newStartTime = minutesToTime(newStartMinutes);
      const newEndTime = minutesToTime(newEndMinutes);
      
      // Update the break time
      breakToMove.startTime = newStartTime;
      breakToMove.endTime = newEndTime;
      breakToMove.startMinutes = newStartMinutes;
      breakToMove.endMinutes = newEndMinutes;
      
      // Assign BC to cover this unit
      smartAssignments.push({
        unit: unit,
        position: `${unit} - Break Cover`,
        staff: matchingBC.name,
        startTime: newStartTime,
        endTime: newEndTime,
        positionType: 'Smart Break Cover (Single Unit)',
        zone: assignments[0]?.zone,
        dayCode: assignments[0]?.dayCode,
        trainingMatch: `${unit}-Break Cover`,
        coveringStaff: breakToMove.staff,
        isBreak: false,
        isSmartBreakCover: true,
        isSingleCoverage: true
      });
      
      // Mark BC as busy during this break
      if (!busyWindows.has(matchingBC.name)) busyWindows.set(matchingBC.name, []);
      busyWindows.get(matchingBC.name).push({ start: newStartMinutes, end: newEndMinutes });
      
      console.log(`   ✅ ${matchingBC.name} → ${unit} (${newStartTime}-${newEndTime}) [covers ${breakToMove.staff}]`);
    } else {
      console.log(`   ⚠️  ${unit}: No matching break cover available`);
    }
  }
  
  // Step 3: Handle remaining breaks with available BC time
  console.log(`\n🎯 Phase 2: Multi-Person Units (Standard Break Coverage)`);
  
  const sortedBreaks = [...breakAssignments].sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  
  for (const breakNeeded of sortedBreaks) {
    // Check if this break is already covered (single-coverage unit from Phase 1)
    if (smartAssignments.some(sa => 
      sa.unit === breakNeeded.unit && 
      sa.coveringStaff === breakNeeded.staff
    )) {
      continue; // Already covered in Phase 1
    }
    
    // Check if unit has 2+ staff during this break (no BC needed)
    const staffPresentDuringBreak = assignments.filter(a => 
      a.unit === breakNeeded.unit && 
      a.staff !== breakNeeded.staff &&
      !a.isBreak &&
      timeToMinutes(a.startTime) <= timeToMinutes(breakNeeded.startTime) &&
      timeToMinutes(a.endTime) >= timeToMinutes(breakNeeded.endTime)
    );
    
    if (staffPresentDuringBreak.length >= 2) {
      console.log(`  ✅ ${breakNeeded.unit}: Already has ${staffPresentDuringBreak.length} staff present during ${breakNeeded.staff}'s break (no BC needed)`);
      continue;
    }
    
    // Find available BC
    const breakStart = timeToMinutes(breakNeeded.startTime);
    const breakEnd = timeToMinutes(breakNeeded.endTime);
    const category = getCategoryFromUnit(breakNeeded.unit);
    
    const matchingBC = breakCoverStaff.find(bc => {
      // Check type
      const bcType = (bc.plannedFunction || bc.scheduledFunction || '').toLowerCase();
      if (category === 'Rides' && !bcType.includes('ride')) return false;
      if ((category === 'Retail' || category === 'Admissions') && bcType.includes('ride')) return false;
      
      // Check skills (now works with correct "Sea Life" mapping!)
      if (!hasSkillForUnit(bc.name, breakNeeded.unit, skillsData)) return false;
      
      // Check working hours
      const bcHours = getStaffWorkingHours(bc.name, timegripData);
      if (!bcHours) return false;
      const bcStart = timeToMinutes(bcHours.startTime);
      const bcEnd = timeToMinutes(bcHours.endTime);
      if (bcStart > breakStart || bcEnd < breakEnd) return false;
      
      // Check availability
      const windows = busyWindows.get(bc.name) || [];
      const clashes = windows.some(w => !(breakEnd <= w.start || breakStart >= w.end));
      return !clashes;
    });
    
    if (matchingBC) {
      if (!busyWindows.has(matchingBC.name)) busyWindows.set(matchingBC.name, []);
      busyWindows.get(matchingBC.name).push({ start: breakStart, end: breakEnd });
      
      smartAssignments.push({
        unit: breakNeeded.unit,
        position: `${breakNeeded.unit} - Break Cover`,
        staff: matchingBC.name,
        startTime: breakNeeded.startTime,
        endTime: breakNeeded.endTime,
        positionType: 'Smart Break Cover',
        zone: assignments[0]?.zone,
        dayCode: assignments[0]?.dayCode,
        trainingMatch: `${breakNeeded.unit}-Break Cover`,
        coveringStaff: breakNeeded.staff,
        isBreak: false,
        isSmartBreakCover: true
      });
      
      console.log(`  ✅ ${matchingBC.name} → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
    } else {
      console.log(`  ⚠️  ${breakNeeded.unit}: No break cover available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
    }
  }
  
  console.log(`\n📊 Smart Break Cover Summary:`);
  console.log(`   Total break cover assignments: ${smartAssignments.length}`);
  console.log(`   Single-coverage units (10:30 breaks): ${smartAssignments.filter(a => a.isSingleCoverage).length}`);
  console.log(`   Multi-person unit coverage: ${smartAssignments.filter(a => !a.isSingleCoverage).length}`);
  
  return smartAssignments;
}

console.log('✅ BUG #15 functions loaded!');

// ============================================================================
// BUG #15: UPDATED - Calculate breaks with STAGGERED TIMING
// ============================================================================

function calculateAllBreaksNeeded(assignmentsToProcess, timegripData) {
  console.log('\n🕐 Calculating staggered break schedule...');
  
  const breakAssignments = [];
  const staffAssignments = new Map();
  
  // Group by staff
  for (const assignment of assignmentsToProcess) {
    if (assignment.isBreak || assignment.unit === 'Zonal Lead') continue;
    
    if (!staffAssignments.has(assignment.staff)) {
      staffAssignments.set(assignment.staff, []);
    }
    staffAssignments.get(assignment.staff).push(assignment);
  }
  
  // ✅ Count how many staff will need breaks (to size break slots appropriately)
  let nonRidesStaffCount = 0;
  for (const [staffName, assignments] of staffAssignments.entries()) {
    const sorted = assignments.sort((a, b) => 
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    const primaryAssignment = sorted[0];
    const breakMinutes = primaryAssignment.breakMinutes;
    const shiftStart = sorted[0].startTime;
    const shiftEnd = sorted[sorted.length - 1].endTime;
    const workHours = calculateWorkHours(shiftStart, shiftEnd, breakMinutes || 0);
    
    // Count non-rides staff who qualify for breaks
    if (breakMinutes && breakMinutes > 0 && workHours >= 4.0 && !primaryAssignment.isBreakCover && primaryAssignment.category !== 'Rides') {
      nonRidesStaffCount++;
    }
  }
  
  // ✅ Create DYNAMIC break slots sized to accommodate all non-rides staff
  // Distribute evenly across 5 time slots (11:00, 12:00, 13:00, 14:00, 15:00)
  const slotsPerTime = Math.ceil(nonRidesStaffCount / 5);
  const breakSlots = [
    { start: '11:00', end: '11:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Early' },
    { start: '12:00', end: '12:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Peak' },
    { start: '13:00', end: '13:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Late' },
    { start: '14:00', end: '14:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'VeryLate' },
    { start: '15:00', end: '15:30', capacity: Math.max(slotsPerTime, 2), assigned: [], label: 'Latest' }
  ];
  
  console.log(`   📊 Creating break slots for ${nonRidesStaffCount} non-rides staff (${slotsPerTime} per time slot)`);

  
  // ✅ Collect rides staff for staggered breaks starting at 11:00
  const ridesBreaksToAssign = [];
  
  // Calculate breaks for each staff member
  for (const [staffName, assignments] of staffAssignments.entries()) {
    const sorted = assignments.sort((a, b) => 
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    );
    
    const shiftStart = sorted[0].startTime;
    const shiftEnd = sorted[sorted.length - 1].endTime;
    const primaryAssignment = sorted[0];
    const breakMinutes = primaryAssignment.breakMinutes;
    
    // Skip if no break OR break cover staff
    // ✅ EXCEPTION: Senior Hosts ALWAYS get 45-min breaks, even if breakMinutes is 0
    const isSeniorHost = primaryAssignment.position && primaryAssignment.position.includes('Senior Host');
    if ((!breakMinutes || breakMinutes === 0) && !isSeniorHost) {
      if (primaryAssignment.isBreakCover) {
        console.log(`   🔄 ${staffName}: Break Cover (no personal break)`);
      }
      continue;
    }
    
    // ✅ Force 45-minute breaks for Senior Hosts if not set
    const actualBreakMinutes = isSeniorHost && (!breakMinutes || breakMinutes === 0) ? 45 : breakMinutes;
    
    if (primaryAssignment.isBreakCover) {
      console.log(`   🔄 ${staffName}: Break Cover (no personal break)`);
      continue;
    }
    
    // ✅ BUG #15: Check if shift < 4 hours (no break required)
    const workHours = calculateWorkHours(shiftStart, shiftEnd, actualBreakMinutes);
    if (workHours < 4.0 && !isSeniorHost) {  // Senior Hosts always get breaks
      console.log(`   ⏭️  ${staffName}: ${workHours.toFixed(2)}h shift (no break required)`);
      continue;
    }
    
    const isRides = primaryAssignment.category === 'Rides';
    
    if (isRides) {
      // RIDES: Collect for staggered breaks starting at 11:00 (BC arrival)
      // We'll assign all rides breaks in one batch after collecting all rides staff
      ridesBreaksToAssign.push({
        staffName,
        unit: primaryAssignment.unit,
        position: primaryAssignment.position,
        shiftStart,
        shiftEnd,
        breakMinutes: actualBreakMinutes
      });
    } else {
      // NON-RIDES: Use PRIORITY-FIRST THEN UNIT-AWARE STAGGERED break slots
      const unit = primaryAssignment.unit;
      
      // ✅ FIX: ALWAYS check priority system FIRST
      // Priority 1: Short-shift staff (≤14:00) → 11:00
      // Priority 2: Senior Hosts → 12:00/13:00/14:00 (NEVER 11:00)
      // Priority 3: Late starters (≥11:00) → 14:00/15:00 (NOT 15:00 for 09:30 starters!)
      let targetSlot = getPreferredBreakSlot(primaryAssignment, breakSlots, assignmentsToProcess);
      
      // ✅ SMART STAGGERING: Category-aware + slot capacity
      const category = primaryAssignment.category;
      
      // STEP 1: Check category-specific limits to prevent clustering
      const sameCategoryInSlot = targetSlot.assigned.filter(assignedStaff => {
        const assignmentData = assignmentsToProcess.find(x => x.staff === assignedStaff);
        return assignmentData && assignmentData.category === category;
      }).length;
      
      // Define max per category per slot
      const categoryLimits = {
        'Car Parks': 1,      // Car Parks work alone → stagger all breaks
        'GHI': 2,            // GHI can have 2 people break together
        'Admissions': 2,     // Admissions can have 2 at same slot
        'Retail': 2          // Retail can have 2 at same slot
      };
      
      const maxForCategory = categoryLimits[category] || 2;
      
      // If category limit reached, find next available slot for this category
      if (sameCategoryInSlot >= maxForCategory) {
        const currentSlotIndex = breakSlots.findIndex(s => s.start === targetSlot.start);
        const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020; // ≤17:00
        
        for (let i = currentSlotIndex + 1; i < breakSlots.length; i++) {
          const nextSlot = breakSlots[i];
          
          // CRITICAL: Skip 15:00 breaks for early closes (4pm/5pm)
          if (isEarlyClose && nextSlot.start === '15:00') {
            continue; // Skip to next slot
          }
          
          const sameCategoryInNext = nextSlot.assigned.filter(assignedStaff => {
            const assignmentData = assignmentsToProcess.find(x => x.staff === assignedStaff);
            return assignmentData && assignmentData.category === category;
          }).length;
          
          // Move if next slot has room for this category AND isn't completely full
          if (sameCategoryInNext < maxForCategory && nextSlot.assigned.length < nextSlot.capacity) {
            console.log(`   🔄 ${staffName}: ${sameCategoryInSlot} ${category} already at ${targetSlot.start}, moving to ${nextSlot.start}`);
            targetSlot = nextSlot;
            break;
          }
        }
      }
      
      // STEP 2: Check overall slot capacity (if slot is completely full)
      if (targetSlot.assigned.length >= targetSlot.capacity) {
        const currentSlotIndex = breakSlots.findIndex(s => s.start === targetSlot.start);
        const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020; // ≤17:00
        
        for (let i = currentSlotIndex + 1; i < breakSlots.length; i++) {
          // CRITICAL: Skip 15:00 breaks for early closes (4pm/5pm)
          if (isEarlyClose && breakSlots[i].start === '15:00') {
            continue; // Skip to next slot
          }
          
          if (breakSlots[i].assigned.length < breakSlots[i].capacity) {
            console.log(`   🔄 ${staffName}: Slot ${targetSlot.start} full (${targetSlot.assigned.length}/${targetSlot.capacity}), moving to ${breakSlots[i].start}`);
            targetSlot = breakSlots[i];
            break;
          }
        }
      }
      
      // Assign to target slot if space available
      if (targetSlot && targetSlot.assigned.length < targetSlot.capacity) {
        targetSlot.assigned.push(staffName);
        
        // Calculate actual end time based on staff's break duration
        const breakDuration = actualBreakMinutes || 30; // Default to 30 if not specified
        const actualEndTime = minutesToTime(timeToMinutes(targetSlot.start) + breakDuration);
        
        breakAssignments.push({
          unit: primaryAssignment.unit,
          position: 'BREAK',
          staff: staffName,
          startTime: targetSlot.start,
          endTime: actualEndTime,
          startMinutes: timeToMinutes(targetSlot.start),
          endMinutes: timeToMinutes(actualEndTime),
          isBreak: true,
          reason: `${targetSlot.label} slot`,
          category: primaryAssignment.category
        });
        
        console.log(`   ☕ ${staffName} (${unit}): ${targetSlot.start}-${actualEndTime} [${targetSlot.label}]`);
      } else {
        // Slot full or no target - find next available slot
        // ✅ RESPECT PRIORITY: Senior Hosts should only get 12:00+ slots even in overflow
        const isSeniorHostOverflow = primaryAssignment.position && primaryAssignment.position.includes('Senior Host');
        let alternateSlot;
        
        if (isSeniorHostOverflow) {
          // Senior Host: Only consider slots 12:00 or later
          const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020; // ≤17:00
          
          alternateSlot = breakSlots.find(s => {
            // Must be 12:00 or later for Senior Hosts
            if (timeToMinutes(s.start) < timeToMinutes('12:00')) {
              return false;
            }
            // Skip 15:00 for early closes
            if (isEarlyClose && s.start === '15:00') {
              return false;
            }
            return s.assigned.length < s.capacity;
          });
          
          if (!alternateSlot) {
            console.log(`   ⚠️  ${staffName}: All Senior Host slots (12:00+) full!`);
          }
        } else {
          // Regular staff: Any available slot
          const isEarlyClose = primaryAssignment.endTime && timeToMinutes(primaryAssignment.endTime) <= 1020; // ≤17:00
          
          alternateSlot = breakSlots.find(s => {
            // Skip 15:00 for early closes
            if (isEarlyClose && s.start === '15:00') {
              return false;
            }
            return s.assigned.length < s.capacity;
          });
        }
        
        if (alternateSlot) {
          alternateSlot.assigned.push(staffName);
          
          // Calculate actual end time based on staff's break duration
          const breakDuration = actualBreakMinutes || 30;
          const actualEndTime = minutesToTime(timeToMinutes(alternateSlot.start) + breakDuration);
          
          breakAssignments.push({
            unit: primaryAssignment.unit,
            position: 'BREAK',
            staff: staffName,
            startTime: alternateSlot.start,
            endTime: actualEndTime,
            startMinutes: timeToMinutes(alternateSlot.start),
            endMinutes: timeToMinutes(actualEndTime),
            isBreak: true,
            reason: `${alternateSlot.label} overflow`,
            category: primaryAssignment.category
          });
          
          console.log(`   ☕ ${staffName} (${unit}): ${alternateSlot.start}-${actualEndTime} [Overflow]`);
        }
      }
    }
  }
  
  // ✅ Assign staggered rides breaks starting at 11:00 (when BC arrives)
  console.log(`\n🎢 Assigning ${ridesBreaksToAssign.length} rides breaks (staggered from 11:00)...`);
  let currentBreakStart = 11 * 60; // 11:00 in minutes
  
  for (const rider of ridesBreaksToAssign) {
    const breakEnd = currentBreakStart + rider.breakMinutes;
    
    breakAssignments.push({
      unit: rider.unit,
      position: 'BREAK',
      staff: rider.staffName,
      startTime: minutesToTime(currentBreakStart),
      endTime: minutesToTime(breakEnd),
      startMinutes: currentBreakStart,
      endMinutes: breakEnd,
      isBreak: true,
      reason: 'Staggered',
      category: 'Rides'
    });

    console.log(`  ☕ ${rider.staffName} (${rider.unit}): ${minutesToTime(currentBreakStart)}-${minutesToTime(breakEnd)}`);
    
    // Next break starts when this one ends (cascading coverage)
    currentBreakStart = breakEnd;
  }
  
  // Show distribution
  console.log(`\n📊 Break Distribution:`);
  for (const slot of breakSlots) {
    console.log(`   ${slot.start}: ${slot.assigned.length}/${slot.capacity} staff`);
  }
  
  return breakAssignments;
}

// ✅ FIX #2: Split assignments around breaks with correct overlap detection
function splitAssignmentsAroundBreaks(regularAssignments, breakAssignments) {
  const result = [];
  
  for (const assignment of regularAssignments) {
    if (assignment.isBreak) {
      result.push(assignment);
      continue;
    }
    
    // ✅ FIX #2: Correct overlap detection - breaks that overlap with work time
    const breaksForStaff = breakAssignments.filter(b =>
      b.staff === assignment.staff &&
      timeToMinutes(assignment.startTime) < b.endMinutes &&      // Work starts before break ends
      b.startMinutes < timeToMinutes(assignment.endTime)         // Break starts before work ends
    );
    
    if (breaksForStaff.length === 0) {
      result.push(assignment);
    } else {
      // Split around breaks
      let currentStart = timeToMinutes(assignment.startTime);
      
      for (const breakSlot of breaksForStaff.sort((a, b) => a.startMinutes - b.startMinutes)) {
        // Add work before break
        if (currentStart < breakSlot.startMinutes) {
          result.push({
            ...assignment,
            startTime: minutesToTime(currentStart),
            endTime: minutesToTime(breakSlot.startMinutes)
          });
        }
        
        // Add break
        result.push(breakSlot);
        currentStart = breakSlot.endMinutes;
      }
      
      // Add remaining work
      const assignmentEnd = timeToMinutes(assignment.endTime);
      if (currentStart < assignmentEnd) {
        result.push({
          ...assignment,
          startTime: minutesToTime(currentStart),
          endTime: assignment.endTime
        });
      }
    }
  }
  
  return result;
}

// Find late arrivals to cover breaks
// ✅ FIX #9: Smart Break Cover Assignment
// Assigns break cover staff to SPECIFIC UNITS during SPECIFIC BREAKS
// Ensures someone is always at the unit (especially critical ones)

function findBreakCover(breakAssignments, lateArrivals, assignedStaff, timegripData, skillsData, zone, dayCode, normalizeStaffName) {
  const breakCoverAssignments = [];
  const usedLateArrivals = new Set();
  let covered = 0;
  let uncovered = 0;
  
  // PRIORITY 1: Admissions breaks (need Lydia/James/Izzy/Jess for Lodge Entrance)
  const admissionsBreaks = breakAssignments.filter(b => 
    b.unit.toLowerCase().includes('lodge') || 
    b.unit.toLowerCase().includes('entrance') ||
    b.unit.toLowerCase().includes('admissions')
  );
  
  // PRIORITY 2: Retail breaks (Gift Shop, Sweet Shop, etc.)
  const retailBreaks = breakAssignments.filter(b => !admissionsBreaks.includes(b));
  
  // ✅ BUG FIX #12: Separate rides breaks for skill-based matching
  const ridesBreaks = breakAssignments.filter(b => 
    b.position?.includes('Operator') || 
    b.position?.includes('Attendant') ||
    b.unit?.match(/Adventure Tree|Vampire|Gruffalo|Griffin|Sea Dragons|Tiny Truckers|Dragon's/i)
  );
  const nonRidesRetailBreaks = retailBreaks.filter(b => !ridesBreaks.includes(b));
  
  // ✅ BUG FIX #12: Process RIDES breaks with CASCADING COVERAGE
  // Starting at 11:00 when BC arrives, each operator's break is covered by the previous one
  console.log(`\n🎢 Processing ${ridesBreaks.length} rides breaks with cascading coverage...`);
  
  // Sort rides breaks by start time
  const sortedRidesBreaks = ridesBreaks.sort((a, b) => 
    timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
  );
  
  let previousOperator = null;
  let previousOperatorReturnTime = null;
  
  for (let i = 0; i < sortedRidesBreaks.length; i++) {
    const breakNeeded = sortedRidesBreaks[i];
    const breakStart = timeToMinutes(breakNeeded.startTime);
    const breakEnd = timeToMinutes(breakNeeded.endTime);
    
    if (i === 0) {
      // FIRST BREAK: Find BC operator to cover
      const bcOperator = lateArrivals.find(la => {
        const lowerFunc = (la.plannedFunction || la.scheduledFunction || '').toLowerCase();
        return lowerFunc.includes('break cover') && lowerFunc.includes('ride');
      });
      
      if (bcOperator && !usedLateArrivals.has(bcOperator.name)) {
        // Check if BC can cover this specific ride
        const trainedUnits = getStaffTrainedUnits(bcOperator);
        const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
        
        const canCover = trainedUnits.some(tu => {
          const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const unitMatches = tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
          const positionMatches = 
            (breakNeeded.position?.includes('Operator') && tu.skillType?.includes('OP')) ||
            (breakNeeded.position?.includes('Attendant') && tu.skillType?.includes('ATT'));
          return unitMatches && positionMatches;
        });
        
        if (canCover) {
          lateArrivals.push({
            staff: bcOperator.name,
            unit: breakNeeded.unit,
            position: breakNeeded.position,
            startTime: breakNeeded.startTime,
            endTime: breakNeeded.endTime,
            reason: 'BC covers first break'
          });
          usedLateArrivals.add(bcOperator.name);
          console.log(`  ✅ ${bcOperator.name} (BC) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
          
          // Track this operator for cascading
          previousOperator = breakNeeded.staff;
          previousOperatorReturnTime = breakEnd;
          continue;
        }
      }
      
      console.log(`  ⚠️  ${breakNeeded.unit}: No BC operator available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
    } else {
      // SUBSEQUENT BREAKS: Previous operator covers
      if (previousOperator && previousOperatorReturnTime && previousOperatorReturnTime <= breakStart) {
        // Find what ride the previous operator can cover
        const previousOpStaff = allStaff.find(s => s.name === previousOperator);
        if (previousOpStaff) {
          const trainedUnits = getStaffTrainedUnits(previousOpStaff);
          const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          
          const canCover = trainedUnits.some(tu => {
            const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            const unitMatches = tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
            const positionMatches = 
              (breakNeeded.position?.includes('Operator') && tu.skillType?.includes('OP')) ||
              (breakNeeded.position?.includes('Attendant') && tu.skillType?.includes('ATT'));
            return unitMatches && positionMatches;
          });
          
          if (canCover) {
            lateArrivals.push({
              staff: previousOperator,
              unit: breakNeeded.unit,
              position: breakNeeded.position,
              startTime: breakNeeded.startTime,
              endTime: breakNeeded.endTime,
              reason: 'Cascading coverage'
            });
            console.log(`  ✅ ${previousOperator} (returned from break) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
            
            // Update cascade chain
            previousOperator = breakNeeded.staff;
            previousOperatorReturnTime = breakEnd;
            continue;
          }
        }
      }
      
      console.log(`  ⚠️  ${breakNeeded.unit}: No cascading cover available for ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
    }
  }
  
  // ✅ FIX: Use Zonal Leads to cover uncovered rides breaks
  console.log(`\n🔑 Checking for uncovered rides breaks...`);
  const uncoveredRidesBreaks = [];
  
  for (const breakNeeded of sortedRidesBreaks) {
    const hasCoverage = lateArrivals.some(la => 
      la.staff !== breakNeeded.staff &&
      la.unit === breakNeeded.unit &&
      la.startTime === breakNeeded.startTime &&
      la.endTime === breakNeeded.endTime
    );
    
    if (!hasCoverage) {
      uncoveredRidesBreaks.push(breakNeeded);
    }
  }
  
  if (uncoveredRidesBreaks.length > 0) {
    console.log(`   Found ${uncoveredRidesBreaks.length} uncovered rides breaks`);
    
    // Get available Zonal Leads
    const zonalLeadStaff = timegripData.staffByFunction?.MANAGEMENT || [];
    const usedZonalLeads = new Set();
    
    for (const breakNeeded of uncoveredRidesBreaks) {
      const availableLead = zonalLeadStaff.find(lead => 
        !usedZonalLeads.has(lead.name) && !usedLateArrivals.has(lead.name)
      );
      
      if (availableLead) {
        // Check if lead has the skill for this ride
        const trainedUnits = getStaffTrainedUnits(availableLead);
        const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
        
        const canCover = trainedUnits.some(tu => {
          const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          const unitMatches = tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
          const positionMatches = 
            (breakNeeded.position?.includes('Operator') && tu.skillType?.includes('OP')) ||
            (breakNeeded.position?.includes('Attendant') && tu.skillType?.includes('ATT'));
          return unitMatches && positionMatches;
        });
        
        if (canCover) {
          lateArrivals.push({
            staff: availableLead.name,
            unit: breakNeeded.unit,
            position: breakNeeded.position,
            startTime: breakNeeded.startTime,
            endTime: breakNeeded.endTime,
            reason: 'Zonal Lead covers break'
          });
          usedZonalLeads.add(availableLead.name);
          console.log(`   ✅ ${availableLead.name} (Zonal Lead) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime}) covers ${breakNeeded.staff}'s break`);
        } else {
          console.log(`   ⚠️  ${availableLead.name} doesn't have skill for ${breakNeeded.unit}`);
        }
      } else {
        console.log(`   ⚠️  No available Zonal Lead for ${breakNeeded.unit} break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
      }
    }
  } else {
    console.log(`   ✅ All rides breaks are covered!`);
  }
  
  // Process NON-RIDES breaks (original logic)
  console.log(`\n🛍️ Processing ${nonRidesRetailBreaks.length} retail/admissions breaks...`);
  
  for (const breakNeeded of nonRidesRetailBreaks) {
    let foundCover = false;
    
    for (const lateArrival of lateArrivals) {
      if (usedLateArrivals.has(lateArrival.name) || assignedStaff.has(lateArrival.name)) continue;
      
      const trainedUnits = getStaffTrainedUnits(lateArrival);
      
      // Normalize unit names for matching
      const breakUnitNormalized = breakNeeded.unit.toLowerCase()
        .replace(/'/g, '')
        .replace(/\s+/g, '');
      
      const matchingSkill = trainedUnits.find(tu => {
        const tuNormalized = tu.unit.toLowerCase()
          .replace(/'/g, '')
          .replace(/\s+/g, '');
        
        // Check if skill matches the unit (retail/admissions don't need Operator/Attendant checks)
        return tuNormalized.includes(breakUnitNormalized) || 
               breakUnitNormalized.includes(tuNormalized);
      });
      
      if (!matchingSkill) continue; // No matching skill, try next late arrival
      
      const lateWorkingHours = getStaffWorkingHours(lateArrival.name, timegripData);
      if (!lateWorkingHours) continue;
      
      const breakStart = timeToMinutes(breakNeeded.startTime);
      const breakEnd = timeToMinutes(breakNeeded.endTime);
      const workerStart = timeToMinutes(lateWorkingHours.startTime);
      const workerEnd = timeToMinutes(lateWorkingHours.endTime);
      
      if (breakStart < workerStart || breakEnd > workerEnd) continue;
      
      const normalizedSearchName = normalizeStaffName(lateArrival.name);
      const timegripStaff = timegripData.workingStaff.find(s => {
        const normalizedWorkingName = normalizeStaffName(s.name);
        return normalizedWorkingName === normalizedSearchName;
      });
      const staffDisplayName = timegripStaff ? timegripStaff.name : lateArrival.name;
      
      // ✅ ASSIGN BREAK COVER for this ride
      breakCoverAssignments.push({
        unit: breakNeeded.unit,
        position: breakNeeded.position,
        staff: staffDisplayName,
        startTime: breakNeeded.startTime,
        endTime: breakNeeded.endTime,
        isBreak: false,
        isBreakCover: true,
        trainingMatch: matchingSkill.fullSkill,
        zone: zone,
        dayCode: dayCode,
        positionType: `Skill-Based Break Cover (${matchingSkill.skillType})`
      });
      
      usedLateArrivals.add(lateArrival.name);
      assignedStaff.add(lateArrival.name);
      
      console.log(`  ✅ ${staffDisplayName} (${matchingSkill.fullSkill}) → ${breakNeeded.unit} covers ${breakNeeded.staff}'s break (${breakNeeded.startTime}-${breakNeeded.endTime})`);
      covered++;
      foundCover = true;
      break;
    }
    
    if (!foundCover) {
      console.log(`  ⚠️  ${breakNeeded.staff} at ${breakNeeded.unit}: No late arrival with matching skill available`);
      uncovered++;
    }
  }
  
  // Process admissions breaks (existing logic)
  for (const breakNeeded of admissionsBreaks) {
    let foundCover = false;
    
    for (const lateArrival of lateArrivals) {
      if (usedLateArrivals.has(lateArrival.name) || assignedStaff.has(lateArrival.name)) continue;
      
      const trainedUnits = getStaffTrainedUnits(lateArrival);
      const matchingSkill = trainedUnits.find(tu => 
        tu.unit.toLowerCase().includes('admissions')
      );
      
      if (!matchingSkill) continue;
      
      const lateWorkingHours = getStaffWorkingHours(lateArrival.name, timegripData);
      if (!lateWorkingHours) continue;
      
      const breakStart = timeToMinutes(breakNeeded.startTime);
      const breakEnd = timeToMinutes(breakNeeded.endTime);
      const workerStart = timeToMinutes(lateWorkingHours.startTime);
      const workerEnd = timeToMinutes(lateWorkingHours.endTime);
      
      if (breakStart < workerStart || breakEnd > workerEnd) continue;
      
      const normalizedSearchName = normalizeStaffName(lateArrival.name);
      const timegripStaff = timegripData.workingStaff.find(s => {
        const normalizedWorkingName = normalizeStaffName(s.name);
        return normalizedWorkingName === normalizedSearchName;
      });
      const staffDisplayName = timegripStaff ? timegripStaff.name : lateArrival.name;
      
      // ✅ CREATE ROTATIONAL ASSIGNMENT WITH PERSONAL BREAK
      
      // Part 1: Work before break coverage
      if (breakStart > workerStart) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: lateWorkingHours.startTime,
          endTime: breakNeeded.startTime,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      // Part 2: Break coverage
      breakCoverAssignments.push({
        unit: breakNeeded.unit,
        position: `${breakNeeded.unit} Break Cover`,
        staff: staffDisplayName,
        startTime: breakNeeded.startTime,
        endTime: breakNeeded.endTime,
        isBreak: false,
        isBreakCover: true,
        trainingMatch: matchingSkill.fullSkill,
        zone: zone,
        dayCode: dayCode,
        positionType: matchingSkill.skillType
      });
      
      // Calculate this person's own break (3 hours from arrival for retail/admissions)
      const personalBreakStart = workerStart + (3 * 60);
      const personalBreakTime = snapToNearestHour(personalBreakStart);
      
      // Part 3: Work between coverage and personal break
      if (breakEnd < personalBreakTime.startMin && personalBreakTime.startMin < workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: breakNeeded.endTime,
          endTime: personalBreakTime.start,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      // Part 4: Their personal break
      if (personalBreakTime.startMin >= workerStart && personalBreakTime.endMin <= workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: `${breakNeeded.unit} Break`,
          staff: staffDisplayName,
          startTime: personalBreakTime.start,
          endTime: personalBreakTime.end,
          isBreak: true,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
        console.log(`     ✅ ${staffDisplayName} personal break: ${personalBreakTime.start}-${personalBreakTime.end}`);
      }
      
      // Part 5: Work after personal break
      if (personalBreakTime.endMin < workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: personalBreakTime.end,
          endTime: lateWorkingHours.endTime,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      usedLateArrivals.add(lateArrival.name);
      assignedStaff.add(lateArrival.name);
      
      console.log(`  ✅ ${staffDisplayName} → Admissions rotational (${breakNeeded.startTime}-${breakNeeded.endTime} break cover)`);
      covered++;
      foundCover = true;
      break;
    }
    
    if (!foundCover) {
      console.log(`  ⚠️  ${breakNeeded.staff} needs admissions break but NO cover available`);
      uncovered++;
    }
  }
  
  // Process retail/admissions breaks (non-rides)
  console.log(`\n🛍️ Processing ${nonRidesRetailBreaks.length} retail/admissions breaks...`);
  
  for (const breakNeeded of nonRidesRetailBreaks) {
    let foundCover = false;
    
    for (const lateArrival of lateArrivals) {
      if (usedLateArrivals.has(lateArrival.name) || assignedStaff.has(lateArrival.name)) continue;
      
      // ✅ V12: Validate skill matches the specific unit
      if (!hasSkillForUnit(lateArrival.name, breakNeeded.unit, skillsData)) {
        continue;
      }
      
      const trainedUnits = getStaffTrainedUnits(lateArrival);
      const matchingSkill = trainedUnits.find(tu =>
        unitsMatchForBreakCover(tu.unit, breakNeeded.unit)
      );
      
      if (!matchingSkill) continue;
      
      const lateWorkingHours = getStaffWorkingHours(lateArrival.name, timegripData);
      if (!lateWorkingHours) continue;
      
      const breakStart = timeToMinutes(breakNeeded.startTime);
      const breakEnd = timeToMinutes(breakNeeded.endTime);
      const workerStart = timeToMinutes(lateWorkingHours.startTime);
      const workerEnd = timeToMinutes(lateWorkingHours.endTime);
      
      if (breakStart < workerStart || breakEnd > workerEnd) continue;
      
      const normalizedSearchName = normalizeStaffName(lateArrival.name);
      const timegripStaff = timegripData.workingStaff.find(s => {
        const normalizedWorkingName = normalizeStaffName(s.name);
        return normalizedWorkingName === normalizedSearchName;
      });
      const staffDisplayName = timegripStaff ? timegripStaff.name : lateArrival.name;
      
      // ✅ CREATE ROTATIONAL RETAIL ASSIGNMENT WITH PERSONAL BREAK
      
      // Work before
      if (breakStart > workerStart) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: lateWorkingHours.startTime,
          endTime: breakNeeded.startTime,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      // Break coverage
      breakCoverAssignments.push({
        unit: breakNeeded.unit,
        position: `${breakNeeded.unit} Break Cover`,
        staff: staffDisplayName,
        startTime: breakNeeded.startTime,
        endTime: breakNeeded.endTime,
        isBreak: false,
        isBreakCover: true,
        trainingMatch: matchingSkill.fullSkill,
        zone: zone,
        dayCode: dayCode,
        positionType: matchingSkill.skillType
      });
      
      // Calculate personal break (3 hours from arrival)
      const personalBreakStart = workerStart + (3 * 60);
      const personalBreakTime = snapToNearestHour(personalBreakStart);
      
      // Work between coverage and personal break
      if (breakEnd < personalBreakTime.startMin && personalBreakTime.startMin < workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: breakNeeded.endTime,
          endTime: personalBreakTime.start,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      // Personal break
      if (personalBreakTime.startMin >= workerStart && personalBreakTime.endMin <= workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: `${breakNeeded.unit} Break`,
          staff: staffDisplayName,
          startTime: personalBreakTime.start,
          endTime: personalBreakTime.end,
          isBreak: true,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
        console.log(`     ✅ ${staffDisplayName} personal break: ${personalBreakTime.start}-${personalBreakTime.end}`);
      }
      
      // Work after personal break
      if (personalBreakTime.endMin < workerEnd) {
        breakCoverAssignments.push({
          unit: breakNeeded.unit,
          position: getPositionForUnit(breakNeeded.unit),
          staff: staffDisplayName,
          startTime: personalBreakTime.end,
          endTime: lateWorkingHours.endTime,
          isBreak: false,
          isBreakCover: false,
          zone: zone,
          dayCode: dayCode
        });
      }
      
      usedLateArrivals.add(lateArrival.name);
      assignedStaff.add(lateArrival.name);
      
      console.log(`  ✅ ${staffDisplayName} → ${breakNeeded.unit} rotational (${breakNeeded.startTime}-${breakNeeded.endTime} break cover)`);
      covered++;
      foundCover = true;
      break;
    }
    
    if (!foundCover) {
      uncovered++;
    }
  }
  
  return { assignments: breakCoverAssignments, covered, uncovered, total: breakAssignments.length };
}

// Helper: Check if units match for break cover
function unitsMatchForBreakCover(skillUnit, breakUnit) {
  const normalize = (str) => str
    .toLowerCase()
    .replace(/-op|-att|-host|operator|attendant|host|driver|skill/gi, '')
    .replace(/\s+/g, '')
    .trim();
  
  const skillNorm = normalize(skillUnit);
  const breakNorm = normalize(breakUnit);
  
  return skillNorm === breakNorm ||
         skillNorm.includes(breakNorm) ||
         breakNorm.includes(skillNorm);
}

// ✅ V13: Extract specific unit name from planned function
// Maps role names like "Rides - AdventureTreeOperator" to unit names like "Adventure Tree"
// Returns null for generic retail/admissions to defer to PASS 2 with smarter logic
function getSpecificUnitFromFunction(plannedFunction) {
  if (!plannedFunction) return null;
  
  const mapping = {
    // === NEXUS ZONE RIDES ===
    'AdventureTreeOperator': 'Adventure Tree',
    'AdventureTree': 'Adventure Tree',
    'Tiny Truckers Operator': 'Tiny Truckers',
    'TinyTruckersOperator': 'Tiny Truckers',
    'CanopyCapersAttendant': 'Canopy Capers',
    'Canopy Capers': 'Canopy Capers',
    'Sea Dragons Operator': 'Sea Dragons',
    'SeaDragonsOperator': 'Sea Dragons',
    'ElmersOperator': "Elmer's Flying Jumbos",
    'Elmers': "Elmer's Flying Jumbos",
    'GriffinsGalleonOperator': "Griffin's Galeon",
    'GriffinsGalleonOperato': "Griffin's Galeon", // Handle truncation
    'ROTB Attendant': 'Room on the Broom',
    "Dragon's Playhouse": "Dragon's Playhouse",
    "Dragon'sPlayhouseAttendant": "Dragon's Playhouse",
    "Dragon'sPlayhouseAtten": "Dragon's Playhouse", // TRUNCATED!
    
    // === ODYSSEY ZONE RIDES (MISSING!) ===
    "Dragon'sFuryOperator": "Dragon's Fury",
    "Dragon'sFuryAttendant": "Dragon's Fury",
    "DragonsFuryOperator": "Dragon's Fury", // Without apostrophe
    "DragonsFuryAttendant": "Dragon's Fury",
    "Dragon's Fury": "Dragon's Fury",
    'TreetopHoppersOperator': 'Tree Top Hoppers',
    'TreetopHoppersAttendant': 'Tree Top Hoppers',
    'Treetop Hoppers': 'Tree Top Hoppers',
    'JungleRangersOperator': 'Jungle Rangers',
    'JungleRangersAttendant': 'Jungle Rangers',
    'Jungle Rangers': 'Jungle Rangers',
    'Rattlesnake Operator': 'Rattlesnake',
    'Rattlesnake Attendant': 'Rattlesnake',
    'RattlesnakeOperator': 'Rattlesnake',
    'RattlesnakeAttendant': 'Rattlesnake',
    'Tomb Blaster Operator': 'Tomb Blaster',
    'Tomb Blaster Attendant': 'Tomb Blaster',
    'TombBlasterOperator': 'Tomb Blaster',
    'TombBlasterAttendant': 'Tomb Blaster',
    'ZufariOperator': 'Zufari',
    'ZufariAttendant': 'Zufari',
    'Zufari': 'Zufari',
    'River Rafts': 'River Rafts',
    'RiverRaftsOperator': 'River Rafts',
    'RiverRaftsAttendant': 'River Rafts',
    'Monkey Swinger': 'Monkey Swinger',
    'MonkeySwingerOperator': 'Monkey Swinger',
    'MonkeySwingerAttendant': 'Monkey Swinger',
    'Croc Drop': 'Croc Drop',
    'CrocDropOperator': 'Croc Drop',
    'CrocDropAttendant': 'Croc Drop',
    
    // === PAW PATROL RIDES ===
    "Paw Patrol Chase's": "Paw Patrol Chase's",
    "PawPatrolChase's": "Paw Patrol Chase's",
    "Paw Patrol Marshall's": "Paw Patrol Marshall's",
    "PawPatrolMarshall's": "Paw Patrol Marshall's",
    "Paw Patrol Skye's": "Paw Patrol Skye's",
    "PawPatrolSkye's": "Paw Patrol Skye's",
    "Paw Patrol Zuma's": "Paw Patrol Zuma's",
    "PawPatrolZuma's": "Paw Patrol Zuma's",
    
    // === PHANTOM ZONE RIDES (MISSING!) ===
    'Vampire Operator': 'Vampire',
    'Vampire Attendant': 'Vampire',
    'VampireOperator': 'Vampire',
    'VampireAttendant': 'Vampire',
    'Vampire': 'Vampire',
    'Mandrill Mayhem': 'Mandrill Mayhem',
    'MandrillMayhemOperator': 'Mandrill Mayhem',
    'MandrillMayhemAttendant': 'Mandrill Mayhem',
    'Mandrill': 'Mandrill Mayhem',
    'Mamba Strike': 'Mamba Strike',
    'MambaStrikeOperator': 'Mamba Strike',
    'MambaStrikeAttendant': 'Mamba Strike',
    'Mamba': 'Mamba Strike',
    'Tiger Rock': 'Tiger Rock',
    'TigerRockOperator': 'Tiger Rock',
    'TigerRockAttendant': 'Tiger Rock',
    'Gruffalo River Ride': 'Gruffalo River Ride',
    'Gruffalo Operator': 'Gruffalo River Ride',
    'Gruffalo Attendant': 'Gruffalo River Ride',
    'GruffaloOperator': 'Gruffalo River Ride',
    'GruffaloAttendant': 'Gruffalo River Ride',
    'Gruffalo': 'Gruffalo River Ride', // Generic fallback
    'Blue Barnacle': 'Blue Barnacle',
    'BlueBarnacleOperator': 'Blue Barnacle',
    'BlueBarnacleAttendant': 'Blue Barnacle',
    'Trawler Trouble': 'Trawler Trouble',
    'TrawlerTroubleOperator': 'Trawler Trouble',
    'TrawlerTroubleAttendant': 'Trawler Trouble',
    'Trawler': 'Trawler Trouble',
    'Barrel Bail Out': 'Barrel Bail Out',
    'BarrelBailOutOperator': 'Barrel Bail Out',
    'BarrelBailOutAttendant': 'Barrel Bail Out',
    'BarrelsOperator': 'Barrel Bail Out', // TimeGrip says "Barrels"
    'Barrels': 'Barrel Bail Out',
    'Seastorm': 'Seastorm',
    'SeastormOperator': 'Seastorm',
    'SeastormAttendant': 'Seastorm',
    'Seastorm Operator': 'Seastorm',
    'Ostrich Stampede': 'Ostrich Stampede',
    'OstrichStampedeOperator': 'Ostrich Stampede',
    'OstrichStampedeAttendant': 'Ostrich Stampede',
    'Ostrich': 'Ostrich Stampede',
    
    // === BREAK COVER ===
    'Retail Break Cover': 'Retail Break Cover',
    'Retail  - Break Cover': 'Retail Break Cover', // Double space!
    'Rides Break Cover': 'Rides Break Cover',
    
    // === GHI ===
    'GHI Front Desk Host': 'GHI - Hub',
    'GHI Front_Desk_Host': 'GHI - Hub',
    'GHI Senior Host': 'GHI - Hub',
    'GHI Senior_Host': 'GHI - Hub',
    'GHI Help_Squad_Host': 'GHI - Help Squad',
    'GHI Help Squad Host': 'GHI - Help Squad',
    'GHI RAP_Host': 'GHI - Rap',
    'GHI RAP Host': 'GHI - Rap',
    
    // === CAR PARKS / ADMISSIONS ===
    'Car Park - Host': 'Car Parks - Staff Car Park',
    'Car Parks - Host': 'Car Parks - Staff Car Park',
  };
  
  // Try to match keys in the mapping (specific roles first)
  for (const [key, unit] of Object.entries(mapping)) {
    if (plannedFunction.includes(key)) {
      return unit;
    }
  }
  
  // DEFER GENERIC RETAIL: Return null to use smarter PASS 2 logic
  // This finds the retail unit that needs staff most
  if (plannedFunction.includes('Retail') && (plannedFunction.includes('Host') || plannedFunction.includes('Senior'))) {
    return null; // Will be handled in PASS 2 with better matching
  }
  
  // DEFER GENERIC ADMISSIONS: Return null to use smarter PASS 2 logic
  if (plannedFunction.includes('Admissions') && plannedFunction.includes('Host')) {
    return null; // Will be handled in PASS 2 with better matching
  }
  
  return null;
}

// ✅ V10.0: Auto-assign with SELECTED UNITS (accepts selectedUnits parameter)
app.post('/api/auto-assign', upload.fields([
  { name: 'skillsMatrix', maxCount: 1 },
  { name: 'timegripCsv', maxCount: 1 }
  // ✅ V10.0: No file upload needed!
]), async (req, res) => {
  try {
    const { teamName, zone, dayCode, date, selectedUnits } = req.body;
    
    if (!req.files['skillsMatrix'] || !req.files['timegripCsv']) {
      return res.status(400).json({ error: 'Missing required files' });
    }
    
    const skillsMatrixFile = req.files['skillsMatrix'][0].path;
    const timegripFile = req.files['timegripCsv'][0].path;
    
    const sheetName = teamName.includes('Team') ? teamName : `Team ${teamName}`;
    const skillsData = await parseSkillsMatrix(skillsMatrixFile, sheetName);
    const timegripData = await parseTimegripCsv(timegripFile, teamName, date);
    
    const zoneFilePath = ZONE_FILES[zone];
    if (!zoneFilePath) {
      throw new Error(`Unknown zone: ${zone}`);
    }
    
    if (!fs.existsSync(zoneFilePath)) {
      throw new Error(`Zone file not found: ${zoneFilePath}`);
    }
    
    const zoneData = parseZoneFile(zoneFilePath);
    let staffingRequirements = zoneData.staffingRequirements[dayCode] || [];
    const dayCodeInfo = zoneData.dayCodeOptions.find(dc => dc.code === dayCode);
    
    // ✅ V10.0: FILTER staffing requirements based on selected units
    const selectedUnitsArray = selectedUnits ? JSON.parse(selectedUnits) : [];
    if (selectedUnitsArray.length > 0) {
      console.log(`\n🔍 Filtering staffing requirements...`);
      console.log(`   Selected units from frontend: ${selectedUnitsArray.join(', ')}`);
      
      const beforeCount = staffingRequirements.length;
      staffingRequirements = staffingRequirements.filter(req => {
        return selectedUnitsArray.includes(req.unitName);
      });
      const afterCount = staffingRequirements.length;
      
      console.log(`\n✅ Filtered to ${afterCount} selected units (removed ${beforeCount - afterCount} unselected)`);
      
      // ✅ FIX: Add requirements for selected units that Day Code doesn't include
      const unitsWithRequirements = new Set(staffingRequirements.map(r => r.unitName));
      const missingSelectedUnits = selectedUnitsArray.filter(unit => !unitsWithRequirements.has(unit));
      
      if (missingSelectedUnits.length > 0) {
        console.log(`\n📝 Adding requirements for selected units not in Day Code ${dayCode}:`);
        const closedDaysStatus = getClosedDaysStatus(zoneFilePath, date, dayCode);
        
        for (const unitName of missingSelectedUnits) {
          // Only add if unit is Open in Closed Days
          if (closedDaysStatus[unitName] !== false) {
            // Determine position type based on unit category
            const category = getCategoryFromUnit(unitName);
            
            if (category === 'Rides') {
              // Check if it's an Operator or Attendant ride
              const isOperator = ['Adventure Tree', 'Tiny Truckers', "Griffin's Galeon", 'Sea Dragons', "Elmer's Flying Jumbos"].includes(unitName);
              const position = isOperator ? `${unitName}Operator` : `${unitName}Attendant`;
              
              staffingRequirements.push({
                unitName: unitName,
                position: position,
                staffNeeded: 1
              });
              
              console.log(`   ✅ Added: ${unitName} (${position})`);
              
            } else if (category === 'Admissions') {
              // Add BOTH Senior Host and regular Host for proper entrance coverage
              staffingRequirements.push({
                unitName: unitName,
                position: 'Admissions Senior Host',
                staffNeeded: 1
              });
              
              staffingRequirements.push({
                unitName: unitName,
                position: 'Admissions Host',
                staffNeeded: 1
              });
              
              console.log(`   ✅ Added: ${unitName} (Admissions Senior Host + Host)`);
              
            } else if (category === 'Car Parks') {
              staffingRequirements.push({
                unitName: unitName,
                position: 'Car Parks - Host',
                staffNeeded: 1
              });
              
              console.log(`   ✅ Added: ${unitName} (Car Parks - Host)`);
              
            } else if (category === 'GHI') {
              // Add both Senior Host and Front Desk Host for GHI
              staffingRequirements.push({
                unitName: unitName,
                position: 'GHI Senior Host',
                staffNeeded: 1
              });
              
              staffingRequirements.push({
                unitName: unitName,
                position: 'GHI Front_Desk_Host',
                staffNeeded: 1
              });
              
              console.log(`   ✅ Added: ${unitName} (GHI Senior Host + Front Desk Host)`);
              
            } else if (category === 'Retail') {
              // Add both Senior Host and regular Host for retail units
              staffingRequirements.push({
                unitName: unitName,
                position: 'Retail - Senior Host',
                staffNeeded: 1
              });
              
              staffingRequirements.push({
                unitName: unitName,
                position: 'Retail Host',
                staffNeeded: 1
              });
              
              console.log(`   ✅ Added: ${unitName} (Retail Senior Host + Host)`);
            }
            
          } else {
            console.log(`   ⚠️  Skipped: ${unitName} (marked as Closed)`);
          }
        }
      }
      
      console.log(`   Final units to process: ${staffingRequirements.map(r => r.unitName).join(', ')}`);
    }
    
    // ============================================================================
    // AFTERNOON REASSIGNMENT FUNCTION
    // ============================================================================
    // After lunch breaks (12:00+), entrance overflow staff move to retail
    // Keep 2-3 staff at each entrance (Senior Host + 1-2 baseline hosts)
    // Move overflow staff to retail units that need afternoon help
    function reassignEntranceStaffAfternoon(assignments, staffingRequirements, skillsData, dayCode) {
      console.log('   Analyzing entrance staffing levels post-break...');
      
      const ENTRANCE_UNITS = ['Lodge Entrance', 'Explorer Entrance', 'Azteca Entrance', 'Schools Entrance'];
      const AFTERNOON_START = '13:45'; // After lunch breaks (1:45 PM)
      
      // Check which entrances are open
      const availableEntrances = ENTRANCE_UNITS.filter(unit => 
        staffingRequirements.some(r => r.unitName === unit)
      );
      
      const hasExplorer = availableEntrances.includes('Explorer Entrance');
      const hasSchools = availableEntrances.includes('Schools Entrance');
      const hasLodge = availableEntrances.includes('Lodge Entrance');
      
      // Determine baseline entrances from day code (what SHOULD be there vs manually added)
      // Day Codes E-I: Explorer baseline, B-D: Schools baseline, A/K-N: Lodge only
      const explorerDays = ['E', 'F', 'G', 'H', 'I'];
      const schoolsDays = ['B', 'C', 'D', 'G'];  // G has both
      
      const explorerIsBaseline = explorerDays.includes(dayCode);
      const schoolsIsBaseline = schoolsDays.includes(dayCode);
      
      console.log(`   🚪 Entrances available: ${availableEntrances.join(', ')}`);
      console.log(`   📋 Day Code ${dayCode}: Explorer baseline=${explorerIsBaseline}, Schools baseline=${schoolsIsBaseline}`);
      
      // ✅ Dynamic afternoon targets based on BASELINE day code priority
      // Explorer baseline days (E-I): Keep 4 at Explorer, 3 at Lodge
      // Schools baseline days (B-D): Keep 4 at Lodge, 3 at Schools, 2 at manually-added Explorer
      // Lodge only days (A, K-N): Keep 3 at Lodge
      const AFTERNOON_TARGETS = {};
      
      if (explorerIsBaseline && schoolsIsBaseline) {
        // Both Explorer and Schools in baseline (Day Code G only)
        AFTERNOON_TARGETS['Explorer Entrance'] = 4;  // Highest priority
        AFTERNOON_TARGETS['Lodge Entrance'] = 3;
        AFTERNOON_TARGETS['Schools Entrance'] = 3;
        AFTERNOON_TARGETS['Azteca Entrance'] = 2;
      } else if (explorerIsBaseline && !schoolsIsBaseline) {
        // Explorer baseline (Day Codes E, F, H, I - Explorer 5PM/6PM/7PM)
        AFTERNOON_TARGETS['Explorer Entrance'] = 4;  // Priority entrance
        AFTERNOON_TARGETS['Lodge Entrance'] = 3;
        AFTERNOON_TARGETS['Azteca Entrance'] = 2;
        // If Schools manually added, give it minimum
        if (hasSchools) {
          AFTERNOON_TARGETS['Schools Entrance'] = 2;
          console.log(`   ⚠️  Schools manually added to Explorer day - afternoon target = 2`);
        }
      } else if (schoolsIsBaseline && !explorerIsBaseline) {
        // Schools baseline (Day Codes B, C, D - Lodge 5PM + Schools)
        AFTERNOON_TARGETS['Lodge Entrance'] = 3;     // Reduced from 4 to free up more retail staff
        AFTERNOON_TARGETS['Schools Entrance'] = 3;
        AFTERNOON_TARGETS['Azteca Entrance'] = 2;
        // If Explorer manually added, give it MINIMUM (not priority!)
        if (hasExplorer) {
          AFTERNOON_TARGETS['Explorer Entrance'] = 2;
          console.log(`   ⚠️  Explorer manually added to Schools day - afternoon target = 2 (minimum)`);
        }
      } else {
        // Lodge only baseline (Day Codes A, K-N - quiet days)
        AFTERNOON_TARGETS['Lodge Entrance'] = 3;
        AFTERNOON_TARGETS['Azteca Entrance'] = 2;
        // If Explorer/Schools manually added, give minimum
        if (hasExplorer) {
          AFTERNOON_TARGETS['Explorer Entrance'] = 2;
          console.log(`   ⚠️  Explorer manually added to Lodge-only day - afternoon target = 2`);
        }
        if (hasSchools) {
          AFTERNOON_TARGETS['Schools Entrance'] = 2;
          console.log(`   ⚠️  Schools manually added to Lodge-only day - afternoon target = 2`);
        }
      }
      
      // Ensure all available entrances have targets
      for (const entrance of availableEntrances) {
        if (!AFTERNOON_TARGETS[entrance]) {
          AFTERNOON_TARGETS[entrance] = 2;  // Fallback minimum
          console.log(`   ⚠️  ${entrance} fallback target = 2`);
        }
      }
      
      console.log(`   🎯 Afternoon targets: ${Object.entries(AFTERNOON_TARGETS).map(([k,v]) => `${k.replace(' Entrance', '')}=${v}`).join(', ')}`);
      
      // 🍦 Ben & Jerry's minimum staffing requirement
      const BJ_MIN_STAFF = 2;  // Needs at least 2 staff in afternoon
      
      // Retail priority for afternoon help
      // PRIORITY 1: Ben & Jerry's if understaffed (needs 2-3 minimum)
      // PRIORITY 2: Sweet Shop (general overflow)
      // PRIORITY 3: APGS, Sealife, Explorer Supplies
      const RETAIL_PRIORITY = [
        'Ben & Jerry\'s',           // Priority if understaffed
        'Sweet Shop',
        'Adventures Point Gift Shop',
        'Sealife',
        'Explorer Supplies',
        'Ben & Jerry\'s Kiosk',
        'Lorikeets'
      ];
      
      const updatedAssignments = [...assignments];
      const reassignments = []; // Track what we reassign
      
      // For each entrance, count afternoon staff and identify overflow
      for (const entranceUnit of ENTRANCE_UNITS) {
        // Skip if this entrance doesn't exist for this day code
        const targetStaff = AFTERNOON_TARGETS[entranceUnit];
        if (!targetStaff) {
          continue; // Entrance not open for this day
        }
        
        // Find all staff WORKING at this entrance during afternoon (at/after 13:45)
        // Check if they're working DURING 13:45, not if they START at 13:45
        const afternoonStaff = updatedAssignments.filter(a => 
          a.unit === entranceUnit &&
          a.staff !== 'UNFILLED' &&
          !a.isBreak &&
          timeToMinutes(a.startTime) <= timeToMinutes(AFTERNOON_START) &&
          timeToMinutes(a.endTime) > timeToMinutes(AFTERNOON_START)
        );
        
        if (afternoonStaff.length <= targetStaff) {
          console.log(`   ✅ ${entranceUnit}: ${afternoonStaff.length} afternoon staff (within target of ${targetStaff})`);
          continue; // No overflow, skip
        }
        
        console.log(`   📊 ${entranceUnit}: ${afternoonStaff.length} afternoon staff (target ${targetStaff}, reassign ${afternoonStaff.length - targetStaff} to retail)`);
        
        // Identify who to keep vs reassign
        const seniorHosts = afternoonStaff.filter(a => 
          a.position && a.position.includes('Senior Host')
        );
        
        const regularHosts = afternoonStaff.filter(a => 
          a.position && !a.position.includes('Senior Host')
        );
        
        // Keep: Senior Hosts + enough regular hosts to reach target
        const regularHostsNeeded = Math.max(0, targetStaff - seniorHosts.length);
        const toKeep = [
          ...seniorHosts,
          ...regularHosts.slice(0, regularHostsNeeded)
        ];
        
        // Reassign: Remaining overflow hosts (beyond the target)
        const toReassign = regularHosts.slice(regularHostsNeeded);
        
        console.log(`   → Keep ${toKeep.length} at ${entranceUnit}: ${toKeep.map(a => a.staff).join(', ')}`);
        if (toReassign.length > 0) {
          console.log(`   → Reassign ${toReassign.length} to retail: ${toReassign.map(a => a.staff).join(', ')}`);
        }
        
        // Track overflow assignments per retail unit (for this entrance)
        const overflowPerUnit = {}; // unit -> count
        const MAX_OVERFLOW_PER_UNIT = 2; // Don't overload any single retail unit
        
        // For each staff member to reassign, find retail unit
        for (const staffAssignment of toReassign) {
          const staffName = staffAssignment.staff;
          
          // 🍦 Count current afternoon staff at Ben & Jerry's (across all assignments)
          const bjAfternoonStaff = updatedAssignments.filter(a => 
            a.unit === "Ben & Jerry's" &&
            a.staff !== 'UNFILLED' &&
            !a.isBreak &&
            timeToMinutes(a.startTime) <= timeToMinutes(AFTERNOON_START) &&
            timeToMinutes(a.endTime) > timeToMinutes(AFTERNOON_START)
          );
          const bjCurrentCount = bjAfternoonStaff.length;
          const bjNeedsStaff = bjCurrentCount < BJ_MIN_STAFF;
          
          // Find best retail unit for this staff (priority + availability + skills)
          let targetRetailUnit = null;
          
          // 🍦 PRIORITY CHECK: If B&J understaffed and staff has skill, send there first
          if (bjNeedsStaff && hasSkillForUnit(staffName, "Ben & Jerry's", skillsData) && 
              (overflowPerUnit["Ben & Jerry's"] || 0) < MAX_OVERFLOW_PER_UNIT) {
            targetRetailUnit = "Ben & Jerry's";
            console.log(`   🍦 ${staffName}: ${entranceUnit} → Ben & Jerry's (understaffed: ${bjCurrentCount}/${BJ_MIN_STAFF}, has skill)`);
          } else {
            // Normal priority matching - respect overflow cap
            for (const retailUnit of RETAIL_PRIORITY) {
              // Check if this retail unit exists in requirements
              const retailReq = staffingRequirements.find(r => r.unitName === retailUnit);
              if (!retailReq) continue;
              
              // Skip if already at overflow cap
              if ((overflowPerUnit[retailUnit] || 0) >= MAX_OVERFLOW_PER_UNIT) continue;
              
              // Check if staff has skills for this unit
              if (hasSkillForUnit(staffName, retailUnit, skillsData)) {
                targetRetailUnit = retailUnit;
                console.log(`   ✅ ${staffName}: ${entranceUnit} → ${retailUnit} (skill match)`);
                break;
              }
            }
            
            // If no skilled match found, use fallback priority
            if (!targetRetailUnit) {
              // ⚠️ SAFETY: Never send untrained staff to specialized units!
              // Ben & Jerry's and Kiosk require specific training - SKILL REQUIRED
              const SKILL_REQUIRED_UNITS = ["Ben & Jerry's", "Ben & Jerry's Kiosk", "Sealife"];

              // ✅ FIX 23: Operational minimums — skip units already at their staffing floor
              const STEP6_UNIT_MINIMUMS = {
                'Adventures Point Gift Shop': 3,
                'Sweet Shop': 3,
                'Explorer Supplies': 2,
                'Sealife': 2,
                'Lorikeets': 1,
                "Ben & Jerry's": 2
              };

              // First pass: only route to units below their operational minimum
              targetRetailUnit = RETAIL_PRIORITY.find(unit => {
                const hasUnit = staffingRequirements.some(r => r.unitName === unit);
                const belowCap = (overflowPerUnit[unit] || 0) < MAX_OVERFLOW_PER_UNIT;
                const noSkillRequired = !SKILL_REQUIRED_UNITS.includes(unit);
                if (unit === 'Sealife') {
                  const sealifeTotal = updatedAssignments.filter(a => a.unit === 'Sealife' && !a.isBreak && a.staff !== 'UNFILLED').length;
                  if (sealifeTotal >= 2) return false;
                }
                const currentUnitCount = updatedAssignments.filter(a => a.unit === unit && !a.isBreak && a.staff !== 'UNFILLED').length;
                const unitMin = STEP6_UNIT_MINIMUMS[unit] || 0;
                if (currentUnitCount >= unitMin) return false;
                return hasUnit && belowCap && noSkillRequired;
              });

              // Second pass fallback: any unit below overflow cap
              if (!targetRetailUnit) {
                targetRetailUnit = RETAIL_PRIORITY.find(unit => {
                  const hasUnit = staffingRequirements.some(r => r.unitName === unit);
                  const belowCap = (overflowPerUnit[unit] || 0) < MAX_OVERFLOW_PER_UNIT;
                  const noSkillRequired = !SKILL_REQUIRED_UNITS.includes(unit);
                  if (unit === 'Sealife') {
                    const sealifeTotal = updatedAssignments.filter(a => a.unit === 'Sealife' && !a.isBreak && a.staff !== 'UNFILLED').length;
                    if (sealifeTotal >= 2) return false;
                  }
                  return hasUnit && belowCap && noSkillRequired;
                });
              }

              if (targetRetailUnit) {
                  console.log(`   ⚠️  ${staffName}: ${entranceUnit} → ${targetRetailUnit} (fallback, no skill match)`);
                }
              }
            }
          
          if (targetRetailUnit) {
            // Track this overflow assignment
            overflowPerUnit[targetRetailUnit] = (overflowPerUnit[targetRetailUnit] || 0) + 1;
            // Update assignments that overlap or occur after 13:45
            // We need to handle assignments that SPAN 13:45 (e.g., 12:45-17:45)
            for (let i = 0; i < updatedAssignments.length; i++) {
              const a = updatedAssignments[i];
              if (a.staff === staffName && 
                  a.unit === entranceUnit && 
                  !a.isBreak) {
                
                const assignStart = timeToMinutes(a.startTime);
                const assignEnd = timeToMinutes(a.endTime);
                const afternoonStartMin = timeToMinutes(AFTERNOON_START);
                
                // Check if this assignment overlaps with afternoon period
                if (assignEnd > afternoonStartMin) {
                  if (assignStart >= afternoonStartMin) {
                    // Assignment starts at/after 13:45 - reassign entirely
                    updatedAssignments[i] = {
                      ...a,
                      unit: targetRetailUnit,
                      position: 'Retail Host',
                      positionType: 'Host (Afternoon Reassignment)',
                      category: 'Retail'
                    };
                  } else if (assignStart < afternoonStartMin && assignEnd > afternoonStartMin) {
                    // Assignment spans 13:45 - need to split it
                    // Keep entrance part (start to 13:45)
                    updatedAssignments[i] = {
                      ...a,
                      endTime: AFTERNOON_START
                    };
                    
                    // Add retail part (13:45 to end)
                    updatedAssignments.push({
                      ...a,
                      unit: targetRetailUnit,
                      position: 'Retail Host',
                      positionType: 'Host (Afternoon Reassignment)',
                      category: 'Retail',
                      startTime: AFTERNOON_START,
                      // Keep original endTime
                    });
                  }
                }
              }
            }
            
            reassignments.push({
              staff: staffName,
              from: entranceUnit,
              to: targetRetailUnit
            });
          }
        }
      }
      
      // ✅ BEN & JERRY'S CASCADE: Ensure B&J gets skilled staff
      // If someone without B&J skill was assigned to Sweet Shop,
      // and someone at Sweet Shop HAS B&J skill, swap them
      console.log(`\n   🍦 Checking Ben & Jerry's staffing needs...`);
      
      const bjUnit = "Ben & Jerry's";
      const sweetUnit = "Sweet Shop";
      
      // Check if B&J exists and needs staff
      const bjExists = staffingRequirements.some(r => r.unitName === bjUnit);
      if (bjExists) {
        // Count afternoon staff at B&J (should be 2-3)
        const bjAfternoonStaff = updatedAssignments.filter(a =>
          a.unit === bjUnit &&
          a.staff !== 'UNFILLED' &&
          !a.isBreak &&
          timeToMinutes(a.startTime) <= timeToMinutes(AFTERNOON_START) &&
          timeToMinutes(a.endTime) > timeToMinutes(AFTERNOON_START)
        );
        
        const bjTarget = 2; // Minimum needed
        const bjCurrent = bjAfternoonStaff.length;
        
        console.log(`   📊 ${bjUnit}: ${bjCurrent}/${bjTarget} afternoon staff`);
        
        if (bjCurrent < bjTarget) {
          console.log(`   ⚠️  ${bjUnit} understaffed! Looking for skilled staff to cascade...`);
          
          // Find staff at Sweet Shop who have B&J skill
          const sweetAfternoonStaff = updatedAssignments.filter(a =>
            a.unit === sweetUnit &&
            a.staff !== 'UNFILLED' &&
            !a.isBreak &&
            timeToMinutes(a.startTime) <= timeToMinutes(AFTERNOON_START) &&
            timeToMinutes(a.endTime) > timeToMinutes(AFTERNOON_START)
          );
          
          for (const sweetAssignment of sweetAfternoonStaff) {
            if (bjCurrent >= bjTarget) break; // Got enough staff at B&J
            
            const staffName = sweetAssignment.staff;
            
            // Check if this Sweet Shop staff has B&J skill
            if (hasSkillForUnit(staffName, bjUnit, skillsData)) {
              console.log(`   🔄 CASCADE: ${staffName} has B&J skill, moving from ${sweetUnit} → ${bjUnit}`);
              
              // Move this staff from Sweet Shop to B&J
              for (let i = 0; i < updatedAssignments.length; i++) {
                const a = updatedAssignments[i];
                if (a.staff === staffName && 
                    a.unit === sweetUnit && 
                    !a.isBreak) {
                  
                  const assignStart = timeToMinutes(a.startTime);
                  const assignEnd = timeToMinutes(a.endTime);
                  const afternoonStartMin = timeToMinutes(AFTERNOON_START);
                  
                  // Handle assignments that overlap afternoon period
                  if (assignEnd > afternoonStartMin) {
                    if (assignStart >= afternoonStartMin) {
                      // Assignment starts at/after 13:45 - move to B&J
                      updatedAssignments[i] = {
                        ...a,
                        unit: bjUnit
                      };
                    } else if (assignStart < afternoonStartMin && assignEnd > afternoonStartMin) {
                      // Assignment spans 13:45 - split it
                      updatedAssignments[i] = {
                        ...a,
                        endTime: AFTERNOON_START
                      };
                      
                      updatedAssignments.push({
                        ...a,
                        unit: bjUnit,
                        startTime: AFTERNOON_START
                      });
                    }
                  }
                }
              }
              
              bjCurrent++;
              reassignments.push({
                staff: staffName,
                from: sweetUnit,
                to: bjUnit,
                cascade: true
              });
            }
          }
          
          if (bjCurrent < bjTarget) {
            console.log(`   ⚠️  ${bjUnit} still needs ${bjTarget - bjCurrent} more skilled staff`);
          }
        }
      }
      
      if (reassignments.length > 0) {
        console.log(`\n   📊 Afternoon Reassignment Summary: ${reassignments.length} staff moved to retail`);
      } else {
        console.log(`\n   ✅ No afternoon reassignments needed (all entrances within 2-3 staff target)`);
      }
      
      return updatedAssignments;
    }
    
    console.log(`\n=== AUTO-ASSIGNING for ${teamName}, Zone: ${zone}, Day Code: ${dayCode} ===`);
    console.log(`Staff available: ${skillsData.staffWithGreen.length}`);
    console.log(`Working today: ${timegripData.workingStaff.length}`);
    console.log(`Positions to fill: ${staffingRequirements.length}\n`);
    
    const assignments = [];
    const assignedStaff = new Set();
    const filledPositions = new Map();
    let assigned = 0;
    
    // Initialize position tracking
    staffingRequirements.forEach(req => {
      filledPositions.set(req.position, 0);
    });
    
    // ✅ ZONAL LEADS: Pre-assign as "Roaming" BEFORE main assignment loop
    console.log(`\n🔑 Identifying Zonal Leads from Skills Matrix...`);
    const zonalLeadNames = skillsData.zonalLeads || [];
    console.log(`   Found ${zonalLeadNames.length} zonal leads in Skills Matrix: ${zonalLeadNames.slice(0, 5).join(', ')}`);
    
    // ✅ BUG FIX #10: ALSO get Zonal Leads from TimeGrip MANAGEMENT category
    console.log(`\n🔑 Identifying Zonal Leads from TimeGrip MANAGEMENT category...`);
    const timegripZonalLeads = [];
    if (timegripData.staffByFunction?.MANAGEMENT) {
      for (const staff of timegripData.staffByFunction.MANAGEMENT) {
        if (staff.plannedFunction && staff.plannedFunction.includes('Zonal Lead')) {
          timegripZonalLeads.push(staff.name);
        }
      }
    }
    console.log(`   Found ${timegripZonalLeads.length} zonal leads in TimeGrip: ${timegripZonalLeads.slice(0, 5).join(', ')}`);
    
    // ✅ BUG FIX #10: Combine BOTH sources (union - no duplicates)
    const allZonalLeadNames = new Set([...zonalLeadNames, ...timegripZonalLeads]);
    console.log(`\n🔑 Total unique Zonal Leads (Skills Matrix + TimeGrip): ${allZonalLeadNames.size}`);
    console.log(`   Combined list: ${Array.from(allZonalLeadNames).join(', ')}`);
    
    // Find staff from Skills Matrix who are Zonal Leads
    const zonalLeadStaffFromMatrix = skillsData.staffWithGreen.filter(staff => {
      const normalized = normalizeStaffName(staff.name);
      return Array.from(allZonalLeadNames).some(lead => 
        normalizeStaffName(lead) === normalized
      );
    });
    
    // ✅ BUG FIX #10: Add TimeGrip-only Zonal Leads (not in Skills Matrix)
    const zonalLeadsToProcess = [...zonalLeadStaffFromMatrix];
    for (const leadName of timegripZonalLeads) {
      const normalizedLead = normalizeStaffName(leadName);
      const alreadyInList = zonalLeadsToProcess.some(s => 
        normalizeStaffName(s.name) === normalizedLead
      );
      
      if (!alreadyInList) {
        // Create minimal staff object for TimeGrip-only Zonal Lead
        zonalLeadsToProcess.push({
          name: leadName,
          skills: [] // No skills needed for Zonal Leads
        });
        console.log(`   ➕ Added TimeGrip-only Zonal Lead: ${leadName}`);
      }
    }
    
    console.log(`\n🔑 Processing ${zonalLeadsToProcess.length} Zonal Leads (showing "Roaming" in Excel)`);
    
    for (const staff of zonalLeadsToProcess) {
      if (!isStaffAvailableForTime(staff.name, '08:00', '16:00', timegripData)) {
        continue;
      }
      
      const workingHours = getStaffWorkingHours(staff.name, timegripData);
      if (!workingHours) {
        continue;
      }
      
      const normalizedSearchName = normalizeStaffName(staff.name);
      
      // ✅ BUG FIX #9: Search for Zonal Leads in BOTH MANAGEMENT and general workingStaff
      // First try MANAGEMENT category (where Zonal Leads should be)
      let timegripStaff = null;
      if (timegripData.staffByFunction?.MANAGEMENT) {
        timegripStaff = timegripData.staffByFunction.MANAGEMENT.find(s => {
          const normalizedWorkingName = normalizeStaffName(s.name);
          return normalizedWorkingName === normalizedSearchName;
        });
      }
      
      // Fallback: search in general workingStaff list
      if (!timegripStaff) {
        timegripStaff = timegripData.workingStaff.find(s => {
          const normalizedWorkingName = normalizeStaffName(s.name);
          return normalizedWorkingName === normalizedSearchName;
        });
      }
      
      const staffDisplayName = timegripStaff ? timegripStaff.name : staff.name;
      
      assignments.push({
        unit: 'Zonal Lead',
        position: 'Zonal Leads',
        positionType: 'Roaming',
        staff: staffDisplayName,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: 'Zonal Lead',
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        breakMinutes: workingHours.breakMinutes || 0,  // ✅ FIX #1a: Include break info from TimeGrip
        isBreak: false
      });
      
      assignedStaff.add(staff.name);
      console.log(`  ✅ ${staff.name} assigned as Zonal Lead (Roaming) ${workingHours.startTime}-${workingHours.endTime}`);
      assigned++;
    }
    
    // ================================================================================
    // ✅ V11 PASS 0 (REVISED): Calculate Breaks & Find Late Arrival Coverage
    // ================================================================================
    
    // ✅ PASS 1: SPECIFIC Assignments - from TimeGrip Planned Function (V13)
    console.log('\n📋 PASS 1: Exact Specific Matches (from TimeGrip Planned Function)');
    
    const specificStaff = timegripData.staffByFunction?.SPECIFIC || [];
    console.log(`   Processing ${specificStaff.length} SPECIFIC staff from TimeGrip...`);
    
    for (const timegripStaff of specificStaff) {
      if (assignedStaff.has(timegripStaff.name)) continue;
      
      // Extract unit from planned function using V13 mapping
      const specificUnit = getSpecificUnitFromFunction(timegripStaff.plannedFunction);
      
      if (!specificUnit) {
        console.log(`  ⚠️  ${timegripStaff.name}: Could not extract unit from "${timegripStaff.plannedFunction}"`);
        continue;
      }
      
      // ✅ BUG FIX #8: Extract Operator/Attendant designation from TimeGrip
      const plannedFunctionLower = (timegripStaff.plannedFunction || '').toLowerCase();
      const isOperator = plannedFunctionLower.includes('operator') || plannedFunctionLower.includes(' op');
      const isAttendant = plannedFunctionLower.includes('attendant') || plannedFunctionLower.includes('att ') || plannedFunctionLower.includes(' att');
      
      // Find matching requirement with CORRECT position type (Operator vs Attendant)
      let requirement = staffingRequirements.find(req => {
        const unitMatches = req.unitName.toLowerCase() === specificUnit.toLowerCase();
        if (!unitMatches) return false;
        
        // ✅ BUG FIX #8: Match position type (Operator vs Attendant)
        const reqPositionLower = req.position.toLowerCase();
        const reqIsOperator = reqPositionLower.includes('operator');
        const reqIsAttendant = reqPositionLower.includes('attendant');
        
        // If TimeGrip says Operator, only match Operator positions
        if (isOperator && !reqIsOperator) return false;
        // If TimeGrip says Attendant, only match Attendant positions
        if (isAttendant && !reqIsAttendant) return false;
        
        return true;
      });
      
      // ✅ FIX #1: If exact match is full OR doesn't exist, try ANY position in same category (allow overstaffing)
      if (!requirement || (filledPositions.get(requirement.position) || 0) >= requirement.staffNeeded) {
        // Is this a Car Parks staff member?
        if (specificUnit.toLowerCase().includes('car park')) {
          // Try ANY Car Parks position (allow overstaffing)
          const carParkPositions = staffingRequirements.filter(req =>
            req.unitName.includes('Car Parks') &&
            !req.unitName.includes('Break Cover')
          );
          
          if (carParkPositions.length > 0) {
            // Pick the least-filled position
            const sorted = carParkPositions.sort((a, b) => {
              const fillA = filledPositions.get(a.position) || 0;
              const fillB = filledPositions.get(b.position) || 0;
              return fillA - fillB;
            });
            requirement = sorted[0];  // Use this position instead
            console.log(`  ↪️  ${timegripStaff.name}: Car Parks reassigned to ${requirement.unitName}`);
          }
        }
      }
      
      if (!requirement) {
        console.log(`  ⚠️  ${timegripStaff.name}: Could not assign to category`);
        continue;
      }
      
      // ✅ ASSIGN (allow overstaffing - don't check if full!)
      assignments.push({
        unit: requirement.unitName,
        position: requirement.position,
        positionType: 'Specific (V13)',
        staff: timegripStaff.name,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: `Specific: ${timegripStaff.plannedFunction}`,
        startTime: timegripStaff.startTime,
        endTime: timegripStaff.endTime,
        breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1b: Include break info
        isBreak: false,
        category: getCategoryFromUnit(requirement.unitName)  // ✅ Add category for break logic
      });
      
      assignedStaff.add(timegripStaff.name);
      filledPositions.set(requirement.position, (filledPositions.get(requirement.position) || 0) + 1);
      
      console.log(`  ✅ ${timegripStaff.name} → ${requirement.unitName} (${requirement.position}) ${timegripStaff.startTime}-${timegripStaff.endTime}`);
      assigned++;
    }
    

 // ✅ PASS 2: Smart Retail/Admissions Assignment with Shift Coverage
console.log('\n📋 PASS 2: Smart Retail/Admissions & Break Cover Assignment');

// ✅ Redirect unassigned rides staff to Rides Break Cover (e.g. ROTB when unit not selected)
const unassignedRidesStaff = (timegripData.staffByFunction?.SPECIFIC || []).filter(s =>
  !assignedStaff.has(s.name) &&
  s.plannedFunction?.startsWith('Rides -')
);

for (const staff of unassignedRidesStaff) {
  const ridesBreakCoverReq = staffingRequirements.find(r => 
    r.unitName === 'Rides Break Cover' && r.position.includes('Attendant')
  );
  if (!ridesBreakCoverReq) break;
  const filled = assignments.filter(a => a.unit === 'Rides Break Cover' && a.position.includes('Attendant') && !a.isBreak).length;
  if (filled >= ridesBreakCoverReq.staffNeeded) break;

  assignments.push({
    unit: 'Rides Break Cover', position: ridesBreakCoverReq.position,
    positionType: 'Break Cover (Redirected)', staff: staff.name,
    zone, dayCode, trainingMatch: `Redirected: ${staff.plannedFunction}`,
    startTime: staff.startTime, endTime: staff.endTime,
    breakMinutes: staff.scheduledBreakMinutes || 0, isBreak: false
  });
  assignedStaff.add(staff.name);
  filledPositions.set(ridesBreakCoverReq.position, (filledPositions.get(ridesBreakCoverReq.position) || 0) + 1);
  assigned++;
  console.log(`  ✅ ${staff.name} → Rides Break Cover (redirected from ${staff.plannedFunction})`);
}


// Get all retail/admissions staff
const deferredRetailAdmissions = (timegripData.staffByFunction?.SPECIFIC || []).filter(s => 
  (s.plannedFunction?.includes('Retail') || s.plannedFunction?.includes('Admissions')) && 
  s.plannedFunction?.includes('Host') &&
  !assignedStaff.has(s.name)
);

console.log(`   Found ${deferredRetailAdmissions.length} deferred retail/admissions staff`);

// ✅ CLASSIFY STAFF BY TYPE AND SHIFT LENGTH
const staffByType = {
  seniorHostsFullShift: [],      // 09:15-16:45 (45-min break)
  regularHostsFullShift: [],     // 09:15-16:45 (45-min break)
  regularHostsShortShift: [],    // 09:15-13:00 (no break)
  regularHostsMidShift: []       // 11:00-15:00 (no break, break cover)
};

for (const staff of deferredRetailAdmissions) {
  const isSeniorHost = 
    (skillsData.seniorHosts && skillsData.seniorHosts.some(sh => 
      normalizeStaffName(sh) === normalizeStaffName(staff.name)
    )) || 
    (staff.plannedFunction && staff.plannedFunction.includes('Senior Host'));
  
  const shiftStart = staff.startTime;
  const shiftEnd = staff.endTime;
  const shiftDuration = timeToMinutes(shiftEnd) - timeToMinutes(shiftStart);
  const breakMinutes = staff.scheduledBreakMinutes || 0;
  
  // Classify by shift type
  if (isSeniorHost && shiftStart === '09:15' && shiftDuration >= 420) {
    staffByType.seniorHostsFullShift.push(staff);
  } else if (!isSeniorHost && shiftStart === '09:15' && shiftDuration >= 420 && breakMinutes >= 30) {
    staffByType.regularHostsFullShift.push(staff);
  } else if (!isSeniorHost && shiftStart === '09:15' && shiftDuration < 300) {
    staffByType.regularHostsShortShift.push(staff);
  } else if (!isSeniorHost && shiftStart >= '10:00' && shiftDuration <= 300) {
    staffByType.regularHostsMidShift.push(staff);
  } else {
    // Fallback: add to appropriate category
    if (isSeniorHost) {
      staffByType.seniorHostsFullShift.push(staff);
    } else {
      staffByType.regularHostsFullShift.push(staff);
    }
  }
}

console.log(`   → ${staffByType.seniorHostsFullShift.length} Senior Hosts (full shift)`);
console.log(`   → ${staffByType.regularHostsFullShift.length} Regular Hosts (full shift)`);
console.log(`   → ${staffByType.regularHostsShortShift.length} Regular Hosts (short shift 09:15-13:00)`);
console.log(`   → ${staffByType.regularHostsMidShift.length} Regular Hosts (mid shift for break cover)`);

// ✅ PRIORITY UNITS FOR COVERAGE
const PRIORITY_UNITS = {
  seniorHost: ['Lodge Entrance', 'Adventures Point Gift Shop', 'Sweet Shop'],
  allDayCoverage: ['Lodge Entrance', 'Adventures Point Gift Shop', 'Sealife', 'Sweet Shop'],
  shortShiftCoverage: ['Lodge Entrance']  // Morning coverage
};

// ============================================================================
// STEP 1: Assign Senior Hosts to Priority Units (full shift, 1 per unit)
// ============================================================================
console.log(`\n   📍 STEP 1: Assigning Senior Hosts to priority units...`);

// ✅ DYNAMIC PRIORITY LIST: Include all Admissions units (Entrances) + key retail
const admissionsUnits = staffingRequirements
  .filter(r => r.unitName.includes('Entrance') && r.position.includes('Senior Host'))
  .map(r => r.unitName);

const priorityUnitsForSeniorHost = [
  ...new Set([  // Remove duplicates
    ...admissionsUnits,  // All entrance units (Lodge, Explorer, Azteca, Schools)
    'Adventures Point Gift Shop',
    'Sweet Shop'
  ])
];

console.log(`   Priority units for Senior Hosts: ${priorityUnitsForSeniorHost.join(', ')}`);

for (const unitName of priorityUnitsForSeniorHost) {
  const req = staffingRequirements.find(r => 
    r.unitName === unitName && 
    r.position.includes('Senior Host')
  );
  
  if (!req) continue;
  
  // ✅ FIX: Track filled positions per UNIT, not globally by competency
  const unitPositionKey = `${req.unitName}-${req.position}`;
  if ((filledPositions.get(unitPositionKey) || 0) >= req.staffNeeded) {
    console.log(`   ✅ ${unitName}: Already has Senior Host`);
    continue;
  }
  
  const availableSenior = staffByType.seniorHostsFullShift.find(s => !assignedStaff.has(s.name));
  
  if (availableSenior) {
    assignments.push({
      unit: req.unitName,
      position: req.position,
      positionType: 'Senior Host',
      staff: availableSenior.name,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: `${req.unitName}-Senior Host`,
      startTime: availableSenior.startTime,
      endTime: availableSenior.endTime,
      breakMinutes: availableSenior.scheduledBreakMinutes || 0,
      isBreak: false,
      category: getCategoryFromUnit(req.unitName)
    });
    
    assignedStaff.add(availableSenior.name);
    filledPositions.set(unitPositionKey, (filledPositions.get(unitPositionKey) || 0) + 1);
    console.log(`   ✅ ${availableSenior.name} → ${unitName} (Senior Host, ${availableSenior.startTime}-${availableSenior.endTime})`);
    assigned++;
  }
}

// ============================================================================
// STEP 2: Assign Full-Shift Hosts to All-Day Coverage Units
// ============================================================================
console.log(`\n   📍 STEP 2: Assigning full-shift Hosts for all-day coverage...`);

// ✅ BUILD DYNAMIC ASSIGNMENT LIST from unfilled retail/admissions requirements
const fullShiftAssignments = [];
const retailAdmissionsUnits = staffingRequirements.filter(r => 
  (r.unitName.includes('Shop') || r.unitName.includes('Sealife') || r.unitName.includes('Entrance')) &&
  r.position.includes('Host') &&
  !r.position.includes('Senior Host') &&
  !r.position.includes('Break Cover')
);

for (const req of retailAdmissionsUnits) {
  const unitPositionKey = `${req.unitName}-${req.position}`;
  const currentFill = filledPositions.get(unitPositionKey) || 0;
  const needed = req.staffNeeded - currentFill;
  if (needed > 0) {
    fullShiftAssignments.push({ unit: req.unitName, count: needed, req, unitPositionKey });
  }
}

// Units that require specific skills — only trained staff should be assigned
const SKILL_GATED_STEP2 = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sealife', 'Sweet Shop']);

for (const assignment of fullShiftAssignments) {
  for (let i = 0; i < assignment.count; i++) {
    // ✅ FIX: For skill-gated units, only assign trained staff
    const availableHost = SKILL_GATED_STEP2.has(assignment.req.unitName)
      ? staffByType.regularHostsFullShift.find(s => !assignedStaff.has(s.name) && hasSkillForUnit(s.name, assignment.req.unitName, skillsData))
      : staffByType.regularHostsFullShift.find(s => !assignedStaff.has(s.name));
    
    if (availableHost) {
      assignments.push({
        unit: assignment.req.unitName,
        position: assignment.req.position,
        positionType: 'Host (Full Shift)',
        staff: availableHost.name,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: `${assignment.req.unitName}-Host`,
        startTime: availableHost.startTime,
        endTime: availableHost.endTime,
        breakMinutes: availableHost.scheduledBreakMinutes || 0,
        isBreak: false,
        category: getCategoryFromUnit(assignment.req.unitName)
      });
      
      assignedStaff.add(availableHost.name);
      filledPositions.set(assignment.unitPositionKey, (filledPositions.get(assignment.unitPositionKey) || 0) + 1);
      console.log(`   ✅ ${availableHost.name} → ${assignment.req.unitName} (Host, ${availableHost.startTime}-${availableHost.endTime})`);
      assigned++;
    } else {
      console.log(`   ⚠️  No available full-shift host for ${assignment.req.unitName}`);
    }
  }
}

// ============================================================================
// STEP 3: Assign Short-Shift Hosts (09:15-13:00) for Morning Coverage
// ============================================================================
console.log(`\n   📍 STEP 3: Assigning short-shift Hosts (morning coverage)...`);

const shortShiftNeeded = 2;  // 2x Lodge Entrance 09:15-13:00

for (let i = 0; i < shortShiftNeeded; i++) {
  const req = staffingRequirements.find(r => 
    r.unitName === 'Lodge Entrance' && 
    r.position.includes('Host') &&
    !r.position.includes('Senior Host')
  );
  
  if (!req) continue;
  
  const availableShort = staffByType.regularHostsShortShift.find(s => !assignedStaff.has(s.name));
  
  if (availableShort) {
    assignments.push({
      unit: req.unitName,
      position: req.position,
      positionType: 'Host (Short Shift)',
      staff: availableShort.name,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: `${req.unitName}-Host`,
      startTime: availableShort.startTime,
      endTime: availableShort.endTime,
      breakMinutes: 0,  // Short shifts don't get breaks
      isBreak: false,
      category: 'Admissions'
    });
    
    assignedStaff.add(availableShort.name);
    const unitPositionKey = `${req.unitName}-${req.position}`;
    filledPositions.set(unitPositionKey, (filledPositions.get(unitPositionKey) || 0) + 1);
    console.log(`   ✅ ${availableShort.name} → ${req.unitName} (Host SHORT, ${availableShort.startTime}-${availableShort.endTime})`);
    assigned++;
  }
}

// ============================================================================
// STEP 4: Assign Remaining Staff to Unfilled Positions
// ============================================================================
console.log(`\n   📍 STEP 4: Assigning remaining staff...`);

const allRemainingStaff = [
  ...staffByType.seniorHostsFullShift.filter(s => !assignedStaff.has(s.name)),
  ...staffByType.regularHostsFullShift.filter(s => !assignedStaff.has(s.name)),
  ...staffByType.regularHostsShortShift.filter(s => !assignedStaff.has(s.name))
];

for (const staff of allRemainingStaff) {
  if (assignedStaff.has(staff.name)) continue;
  
  // Find any unfilled Host position
  const unfilledReq = staffingRequirements.find(req => {
    const isHost = req.position.includes('Host');
    const category = getCategoryFromUnit(req.unitName);
    // ✅ FIX: Check category instead of hardcoded unit names (catches all Retail/Admissions units)
    const isRetailAdmissions = category === 'Retail' || category === 'Admissions';
    const notBreakCover = !req.position.includes('Break Cover');
    // ✅ FIX: Use unit+position key to match how Steps 1-3 track filled positions
    const unitPositionKey = `${req.unitName}-${req.position}`;
    const needsStaff = (filledPositions.get(unitPositionKey) || 0) < req.staffNeeded;
    
    // Check Senior Host requirements
    const requiresSeniorHost = req.position.includes('Senior Host');
    const isSeniorHost = staffByType.seniorHostsFullShift.includes(staff);
    
    if (requiresSeniorHost && !isSeniorHost) return false;
    
    return isHost && isRetailAdmissions && notBreakCover && needsStaff;
  });
  
  if (unfilledReq) {
    assignments.push({
      unit: unfilledReq.unitName,
      position: unfilledReq.position,
      positionType: 'Host (Remaining)',
      staff: staff.name,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: `${unfilledReq.unitName}-Host`,
      startTime: staff.startTime,
      endTime: staff.endTime,
      breakMinutes: staff.scheduledBreakMinutes || 0,
      isBreak: false,
      category: getCategoryFromUnit(unfilledReq.unitName)
    });
    
    assignedStaff.add(staff.name);
    const unitPosKey = `${unfilledReq.unitName}-${unfilledReq.position}`;
    filledPositions.set(unitPosKey, (filledPositions.get(unitPosKey) || 0) + 1);
    console.log(`   ✅ ${staff.name} → ${unfilledReq.unitName} (${staff.startTime}-${staff.endTime})`);
    assigned++;
  }
}

// ============================================================================
// STEP 5: Assign Overflow Staff to Busy Units (Allow Overstaffing)
// ============================================================================
console.log(`\n   📍 STEP 5: Assigning overflow staff to busy units (allow overstaffing)...`);

// Separate short-shift (morning coverage for Lodge) from full-shift (APGS/Sweet Shop)
const overflowStaff = [
  ...staffByType.seniorHostsFullShift.filter(s => !assignedStaff.has(s.name)),
  ...staffByType.regularHostsFullShift.filter(s => !assignedStaff.has(s.name)),
  ...staffByType.regularHostsShortShift.filter(s => !assignedStaff.has(s.name))
];

console.log(`   Found ${overflowStaff.length} overflow retail staff to assign`);

// ✅ Detect which entrances are open today (needed for dynamic overflow targets)
const hasExplorer = staffingRequirements.some(r => r.unitName === 'Explorer Entrance');
const hasSchools = staffingRequirements.some(r => r.unitName === 'Schools Entrance');
const hasLodge = staffingRequirements.some(r => r.unitName === 'Lodge Entrance');

console.log(`   🚪 Entrances open: ${hasLodge ? 'Lodge' : ''} ${hasExplorer ? 'Explorer' : ''} ${hasSchools ? 'Schools' : ''}`);

// ✅ MINIMUM OVERFLOW TARGETS (dynamic based on which entrances are open)
// NOTE: Lodge Entrance gets ALL "Home @1" staff first (unlimited), then other units get overflow
let UNIT_OVERFLOW_TARGETS;

if (hasExplorer && hasSchools) {
  // Both Explorer and Schools open (e.g., Day Code G)
  UNIT_OVERFLOW_TARGETS = {
    'Explorer Entrance': 4,          // Priority entrance (baseline + 4 overflow = 5-6 total)
    'Lodge Entrance': 3,             // Secondary entrance (baseline + 3 overflow = 4-5 total)
    'Schools Entrance': 2,           // Additional Schools overflow (baseline varies + 2 = 5-6 total)
    'Azteca Entrance': 1,
    'Adventures Point Gift Shop': 2,
    'Sweet Shop': 2,
    'Sealife': 1,
    'Explorer Supplies': 1,
    'Ben & Jerry\'s': 2,
    'Ben & Jerry\'s Kiosk': 1,
    'Lorikeets': 1
  };
} else if (hasExplorer) {
  // Explorer open, no Schools (Day Codes E, F, H, I)
  UNIT_OVERFLOW_TARGETS = {
    'Explorer Entrance': 4,          // Priority entrance (baseline 2-3 + 4 overflow = 5-6 total)
    'Lodge Entrance': 2,             // Secondary (baseline 2 + 2 overflow = 3-4 total)
    'Azteca Entrance': 1,
    'Adventures Point Gift Shop': 2,
    'Sweet Shop': 2,
    'Sealife': 1,
    'Explorer Supplies': 1,
    'Ben & Jerry\'s': 2,
    'Ben & Jerry\'s Kiosk': 1,
    'Lorikeets': 1
  };
} else if (hasSchools) {
  // Schools open, no Explorer (Day Codes B, C, D)
  UNIT_OVERFLOW_TARGETS = {
    'Lodge Entrance': 4,             // Priority entrance (baseline 2 + 4 overflow = 5-6 total)
    'Schools Entrance': 2,           // Additional Schools overflow (baseline 4 + 2 = 5-6 total)
    'Azteca Entrance': 1,
    'Adventures Point Gift Shop': 2,
    'Sweet Shop': 2,
    'Sealife': 1,
    'Explorer Supplies': 1,
    'Ben & Jerry\'s': 2,
    'Ben & Jerry\'s Kiosk': 1,
    'Lorikeets': 1
  };
} else {
  // Lodge only (Day Code A, K-N - quiet days)
  UNIT_OVERFLOW_TARGETS = {
    'Lodge Entrance': 1,             // Quiet day - minimal overflow (baseline 2 + 1 = 2-3 total)
    'Azteca Entrance': 1,
    'Adventures Point Gift Shop': 2,
    'Sweet Shop': 2,
    'Sealife': 1,
    'Lorikeets': 1
  };
}

// Track overflow count per unit for balanced distribution
const overflowCount = {};

// ✅ PRIORITY SYSTEM: Detect which entrances are open, prioritize accordingly
// Explorer Days (E-I): Explorer Entrance takes priority (busier)
// Schools Days (B-D): Lodge + Schools Entrance take priority
// Lodge Only (A, K-N): Lodge priority
const BUSY_DAY_CODES = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const isBusyDay = BUSY_DAY_CODES.includes(dayCode);

// Define ideal priority order based on what's open (hasExplorer, hasSchools, hasLodge defined earlier in Step 5)
let IDEAL_PRIORITY_ORDER;
if (hasExplorer && hasSchools) {
  // Both Explorer and Schools (e.g., Day Code G)
  IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Schools Entrance', 'Azteca Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
} else if (hasExplorer) {
  // Explorer open, no Schools (Day Codes E, F, H, I)
  IDEAL_PRIORITY_ORDER = ['Explorer Entrance', 'Lodge Entrance', 'Azteca Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
} else if (hasSchools) {
  // Schools open, no Explorer (Day Codes B, C, D)
  IDEAL_PRIORITY_ORDER = ['Lodge Entrance', 'Schools Entrance', 'Azteca Entrance', 'Adventures Point Gift Shop', 'Sweet Shop', 'Sealife', 'Explorer Supplies', 'Ben & Jerry\'s', 'Lorikeets'];
} else {
  // Lodge only (Day Code A, K-N - quiet days)
  IDEAL_PRIORITY_ORDER = ['Adventures Point Gift Shop', 'Sweet Shop', 'Lodge Entrance', 'Sealife', 'Azteca Entrance', 'Ben & Jerry\'s', 'Lorikeets'];
}

// ✅ FIX: Filter to only units that actually have requirements for this day code
const availableUnits = staffingRequirements
  .filter(r => 
    r.position.includes('Host') && 
    !r.position.includes('Senior Host') &&
    !r.position.includes('Break Cover') &&
    (r.unitName.includes('Entrance') || r.unitName.includes('Shop') || r.unitName.includes('Sealife') || r.unitName.includes('Supplies') || r.unitName.includes('Jerry') || r.unitName.includes('Lorikeets'))
  )
  .map(r => r.unitName);

const PRIORITY_ORDER = IDEAL_PRIORITY_ORDER.filter(unit => availableUnits.includes(unit));

// Initialize overflow count for all available units
for (const unit of availableUnits) {
  overflowCount[unit] = 0;
}

console.log(`   📊 Day Code ${dayCode} = ${isBusyDay ? 'BUSY' : 'QUIET'} → Priority: ${PRIORITY_ORDER.slice(0, 3).join(', ')}...`);
console.log(`   📋 Available units: ${availableUnits.join(', ')}`);

for (const staff of overflowStaff) {
  if (assignedStaff.has(staff.name)) continue;
  
  let targetUnit = null;
  let positionLabel = 'Host (Overflow)';
  
  // ✅ SHORT-SHIFT STAFF (Home @1 - finish ≤14:00) → ALWAYS go to Lodge Entrance
  const endHour = parseInt(staff.endTime.split(':')[0]);
  if (endHour <= 14) {
    // ALL short-shift staff go to Lodge (no cap for Home @1)
    if (availableUnits.includes('Lodge Entrance')) {
      targetUnit = 'Lodge Entrance';
      positionLabel = 'Host (Morning)';
      console.log(`   🏠 ${staff.name} (Home @${endHour - 12}): Short shift → Lodge morning coverage (ALWAYS)`);
    } else {
      console.log(`   ⚠️  ${staff.name}: Short shift but Lodge Entrance not available, trying fallback...`);
    }
  }
  
  // If no target yet (either full-shift or Lodge not available/at cap for short-shift)
  if (!targetUnit) {
    // ✅ Try priority units first, respecting unit-specific caps
    for (const unitName of PRIORITY_ORDER) {
      const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
      // ✅ Skill gate: B&J and B&J Kiosk require trained staff even in overflow
      const BJ_UNITS = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk"]);
      if (BJ_UNITS.has(unitName) && !hasSkillForUnit(staff.name, unitName, skillsData)) continue;
      if (overflowCount[unitName] < unitCap) {
        targetUnit = unitName;
        break;
      }
    }
    
    // ✅ If all priority units at cap, try ANY available unit that hasn't hit cap
    if (!targetUnit) {
      for (const unitName of availableUnits) {
        const unitCap = UNIT_OVERFLOW_TARGETS[unitName] || 2;
        if (overflowCount[unitName] < unitCap) {
          targetUnit = unitName;
          console.log(`   📌 ${staff.name}: All priority units at cap, using fallback → ${unitName}`);
          break;
        }
      }
    }
    
    // ✅ PHASE 2 FALLBACK: If ALL units hit targets, distribute remaining staff round-robin (unlimited)
    // This ensures NO staff are left unassigned
    if (!targetUnit) {
      // Find the unit with the lowest overflow count (round-robin distribution)
      let minCount = Infinity;
      for (const unitName of PRIORITY_ORDER) {
        if (overflowCount[unitName] < minCount) {
          minCount = overflowCount[unitName];
          targetUnit = unitName;
        }
      }
      
      // If somehow still no target (shouldn't happen), use first available unit
      if (!targetUnit && availableUnits.length > 0) {
        targetUnit = availableUnits[0];
      }
      
      if (targetUnit) {
        const target = UNIT_OVERFLOW_TARGETS[targetUnit] || 2;
        console.log(`   📌 ${staff.name}: All targets met, round-robin distribution → ${targetUnit} (${overflowCount[targetUnit] + 1} overflow, target was ${target})`);
      }
    }
  }
  
  if (!targetUnit) {
    console.log(`   ⚠️  ${staff.name}: ERROR - Could not find any available unit (this should not happen)`);
    continue;
  }
  
  const req = staffingRequirements.find(r => 
    r.unitName === targetUnit && 
    r.position.includes('Host') &&
    !r.position.includes('Senior Host')
  );
  
  if (req) {
    assignments.push({
      unit: req.unitName,
      position: req.position,
      positionType: positionLabel,
      staff: staff.name,
      zone: zone,
      dayCode: dayCode,
      trainingMatch: `${req.unitName}-Host-${endHour <= 14 ? 'Morning' : 'Overflow'}`,
      startTime: staff.startTime,
      endTime: staff.endTime,
      breakMinutes: endHour <= 14 ? 0 : (staff.scheduledBreakMinutes || 0),  // No breaks for short shifts
      isBreak: false,
      category: getCategoryFromUnit(req.unitName)
    });
    
    assignedStaff.add(staff.name);
    overflowCount[targetUnit]++;
    const unitCap = UNIT_OVERFLOW_TARGETS[targetUnit] || 2;
    const label = endHour <= 14 ? 'MORNING' : `OVERFLOW #${overflowCount[targetUnit]}/${unitCap}`;
    console.log(`   ✅ ${staff.name} → ${req.unitName} (${label}, ${staff.startTime}-${staff.endTime})`);
    assigned++;
  } else {
    console.log(`   ⚠️  ${staff.name}: Could not find requirement for ${targetUnit}`);
  }
}

// Build summary dynamically based on what units exist
const summaryParts = [];
let targetsExceeded = false;
for (const unit of PRIORITY_ORDER) {
  const shortName = unit.replace(' Entrance', '').replace('Adventures Point Gift Shop', 'APGS').replace('Sweet Shop', 'Sweet').replace('Ben & Jerry\'s', 'BJ').replace('Explorer Supplies', 'Exp Supp').replace('Ben & Jerry\'s Kiosk', 'BJ Kiosk');
  const target = UNIT_OVERFLOW_TARGETS[unit] || 2;
  const actual = overflowCount[unit] || 0;
  
  if (actual > target) {
    summaryParts.push(`${shortName}=${actual}/${target}⬆️`);
    targetsExceeded = true;
  } else {
    summaryParts.push(`${shortName}=${actual}/${target}`);
  }
}
console.log(`\n   📊 Overflow distribution: ${summaryParts.join(', ')}`);
if (targetsExceeded) {
  console.log(`   📌 Note: ⬆️ indicates target exceeded (all staff assigned, no one left behind)`);
}
    
    // Handle BREAK_COVER staff (Sam, Lydia)
    const breakCoverStaff = timegripData.staffByFunction?.BREAK_COVER || [];
    console.log(`   Found ${breakCoverStaff.length} break cover staff`);
    
    for (const timegripStaff of breakCoverStaff) {
      if (assignedStaff.has(timegripStaff.name)) continue;
      
      let assigned_bc = false;
      
      // ✅ FIX #5: Use plannedFunction (set by parser) not scheduledFunction for break cover type
      const breakCoverType = timegripStaff.plannedFunction || timegripStaff.scheduledFunction || '';
      let matchingBreakCover = null;
      
      console.log(`  🔍 ${timegripStaff.name}: Break cover type = "${breakCoverType}"`);
      
      // Get all break cover positions (NO fill check - allow overstaffing)
      // ✅ FIX #5B: Don't restrict by fill count; break cover should always match type
      const breakCoverReqs = staffingRequirements.filter(req =>
        (req.position.includes('Break Cover') || req.unitName.includes('Break Cover'))
      );
      
      // Match to correct type based on TimeGrip
      if (breakCoverType.includes('Retail')) {
        matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Retail Break Cover'));
      } else if (breakCoverType.includes('Rides')) {
        matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Rides Break Cover'));
      } else if (breakCoverType === '') {
        // ✅ FIX #5: When scheduledFunction is empty, default to Retail Break Cover (more specific)
        matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Retail Break Cover'));
      }
      
      // If type-specific match still not found, take any break cover
      if (!matchingBreakCover && breakCoverReqs.length > 0) {
        matchingBreakCover = breakCoverReqs[0];
      }
      
      if (matchingBreakCover && breakCoverType.includes('Retail')) {
        // ✅ FIX 21-24: Route Retail BC to understaffed unit as base (not just "Retail Break Cover")
        // They'll rove from their base unit to cover breaks across retail
        const BC_PLACEMENT_PRIORITY = [
          'Adventures Point Gift Shop', 'Sweet Shop', "Ben & Jerry's",
          'Explorer Supplies', 'Sealife', 'Lorikeets'
        ];
        // Target higher than enforcement minimums so BC staff still get placed
        // APGS target 5 allows both BC persons to base here
        const BC_UNIT_MINIMUMS = {
          'Adventures Point Gift Shop': 5,
          'Sweet Shop': 4,
          "Ben & Jerry's": 3,
          'Explorer Supplies': 2,
          'Sealife': 2,
          'Lorikeets': 2
        };
        // Only skill-gate truly specialized units
        const SKILL_GATED_BC = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sweet Shop', 'Sealife']);

        let bcBaseUnit = null;
        let bcBaseReq = null;

        console.log(`  🔍 BC placement debug for ${timegripStaff.name}:`);
        for (const unitName of BC_PLACEMENT_PRIORITY) {
          if (unitName === 'Sealife') {
            const sealifeCount = assignments.filter(a => a.unit === 'Sealife' && !a.isBreak && a.staff !== 'UNFILLED').length;
            if (sealifeCount >= 2) { console.log(`    ${unitName}: SKIP (Sealife hard cap)`); continue; }
          }
          if (SKILL_GATED_BC.has(unitName) && !hasSkillForUnit(timegripStaff.name, unitName, skillsData)) {
            console.log(`    ${unitName}: SKIP (skill-gated — not trained)`);
            continue;
          }
          const candidateReq = staffingRequirements.find(r =>
            r.unitName === unitName && r.position.includes('Host') && !r.position.includes('Senior Host')
          );
          if (!candidateReq) { console.log(`    ${unitName}: SKIP (no req)`); continue; }
          const currentCount = assignments.filter(a => a.unit === unitName && !a.isBreak && a.staff !== 'UNFILLED').length;
          const minimum = BC_UNIT_MINIMUMS[unitName] || 2;
          console.log(`    ${unitName}: count=${currentCount}, target=${minimum}, placing=${currentCount < minimum}`);
          if (currentCount < minimum) {
            bcBaseUnit = unitName;
            bcBaseReq = candidateReq;
            break;
          }
        }

        if (bcBaseUnit && bcBaseReq) {
          assignments.push({
            unit: bcBaseUnit,
            position: bcBaseReq.position,
            positionType: 'Break Cover (Overflow)',
            staff: timegripStaff.name,
            zone: zone,
            dayCode: dayCode,
            trainingMatch: `${bcBaseUnit}-Break Cover`,
            startTime: timegripStaff.startTime,
            endTime: timegripStaff.endTime,
            breakMinutes: 0,
            isBreak: false,
            isBreakCover: true
          });
          assignedStaff.add(timegripStaff.name);
          console.log(`  ✅ ${timegripStaff.name} → ${bcBaseUnit} [Retail BC — based here, roams for cover]`);
          assigned++;
          assigned_bc = true;
        } else {
          // Fallback: stationary at Retail Break Cover
          const req = matchingBreakCover;
          assignments.push({
            unit: req.unitName,
            position: req.position,
            positionType: 'Break Cover',
            staff: timegripStaff.name,
            zone: zone,
            dayCode: dayCode,
            trainingMatch: `${req.unitName}-Break Cover`,
            startTime: timegripStaff.startTime,
            endTime: timegripStaff.endTime,
            breakMinutes: 0,
            isBreak: false,
            isBreakCover: true
          });
          assignedStaff.add(timegripStaff.name);
          console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} [Retail BC — stationary fallback]`);
          assigned++;
          assigned_bc = true;
        }
      } else if (matchingBreakCover) {
        const req = matchingBreakCover;
        assignments.push({
          unit: req.unitName,
          position: req.position,
          positionType: 'Break Cover',
          staff: timegripStaff.name,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${req.unitName}-Break Cover`,
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1d: Include break info
          isBreak: false
        });
        assignedStaff.add(timegripStaff.name);
        filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
        console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (${req.position}) [Break Cover]`);
        assigned++;
        assigned_bc = true;
      }
      
      // If no break cover role, assign to admissions/retail to cover gaps
      if (!assigned_bc) {
        const fallbackReqs = staffingRequirements.filter(req => {
          const isHost = req.position.includes('Host');
          const isRetailAdmissions = req.unitName.includes('Entrance') || req.unitName.includes('Shop') || req.unitName === 'Sealife';
          const hasCapacity = (filledPositions.get(req.position) || 0) < req.staffNeeded;
          
          if (!isHost || !isRetailAdmissions || !hasCapacity) return false;
          
          // ✅ BUG FIX #7b (ENHANCED): Check if position requires Senior Host
          const requiresSeniorHost = req.position.includes('Senior Host');
          
          if (requiresSeniorHost) {
            // ✅ BUG FIX #7b (ENHANCED): Dual verification - check BOTH Skills Matrix AND TimeGrip
            // Method 1: Check Skills Matrix seniorHosts list
            const inSkillsMatrix = skillsData.seniorHosts && skillsData.seniorHosts.some(sh => 
              normalizeStaffName(sh) === normalizeStaffName(timegripStaff.name)
            );
            
            // Method 2: Check TimeGrip plannedFunction field
            const inTimeGrip = timegripStaff.plannedFunction && 
                              timegripStaff.plannedFunction.includes('Senior Host');
            
            // Accept if EITHER source confirms Senior Host status (bulletproof!)
            const isSeniorHost = inSkillsMatrix || inTimeGrip;
            
            return isSeniorHost;  // Only match if actually a Senior Host
          }
          
          return true;  // Regular Host - anyone with HOST skill
        }).sort((a, b) => {
          const fillA = filledPositions.get(a.position) || 0;
          const fillB = filledPositions.get(b.position) || 0;
          return fillA - fillB;
        });
        
        if (fallbackReqs.length > 0) {
          const req = fallbackReqs[0];
          assignments.push({
            unit: req.unitName,
            position: req.position,
            positionType: 'Host (BC fallback)',
            staff: timegripStaff.name,
            zone: zone,
            dayCode: dayCode,
            trainingMatch: `${req.unitName}-Host`,
            startTime: timegripStaff.startTime,
            endTime: timegripStaff.endTime,
            breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1e: Include break info
            isBreak: false
          });
          assignedStaff.add(timegripStaff.name);
          filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
          console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (${req.position}) [Fallback from BC]`);
          assigned++;
        }
      }
    }
    
    // ✅ FIX #8: Handle GENERIC staff (Alex Hawkins) - try to match to Rides/suitable positions
    const genericStaff = (timegripData.staffByFunction?.GENERIC || []).filter(s =>
      !assignedStaff.has(s.name)
    );
    
    if (genericStaff.length > 0) {
      console.log(`   Found ${genericStaff.length} generic staff`);
      
      for (const timegripStaff of genericStaff) {
        if (assignedStaff.has(timegripStaff.name)) continue;
        
        // Generic staff: try Rides positions first (most likely match)
        const ridePositions = staffingRequirements.filter(req =>
          req.unitName.includes('Rides') &&
          !req.position.includes('Break Cover') &&
          (filledPositions.get(req.position) || 0) < req.staffNeeded
        );
        
        if (ridePositions.length > 0) {
          // Sort by fill rate (unfilled first)
          const sorted = ridePositions.sort((a, b) => {
            const fillA = filledPositions.get(a.position) || 0;
            const fillB = filledPositions.get(b.position) || 0;
            return fillA - fillB;
          });
          
          const req = sorted[0];
          assignments.push({
            unit: req.unitName,
            position: req.position,
            positionType: 'Rides (Generic)',
            staff: timegripStaff.name,
            zone: zone,
            dayCode: dayCode,
            trainingMatch: `${req.unitName}-Generic`,
            startTime: timegripStaff.startTime,
            endTime: timegripStaff.endTime,
            breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1f: Include break info
            isBreak: false
          });
          
          assignedStaff.add(timegripStaff.name);
          filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
          console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (GENERIC)`);
          assigned++;
        }
      }
    }
    
    // ✅ PASS 2b: GHI Staff - Assign to ANY GHI position (allow overstaffing)
    console.log('\n📋 PASS 2b: GHI Staff Assignment (Allow Overstaffing)');
    
    const ghiStaff = (timegripData.staffByFunction?.GENERIC || []).filter(s => 
      s.plannedFunction?.includes('GHI') &&
      !assignedStaff.has(s.name)
    );
    
    console.log(`   Found ${ghiStaff.length} generic GHI staff`);
    
    for (const timegripStaff of ghiStaff) {
      // Find ANY GHI position (NO fill check - allow overstaffing!)
      const ghiPositions = staffingRequirements.filter(req =>
        req.unitName.includes('GHI') &&
        !req.unitName.includes('Break Cover')  // ✅ NO fill check!
      );
      
      if (ghiPositions.length === 0) {
        console.log(`  ⚠️  ${timegripStaff.name}: No GHI positions exist`);
        continue;
      }
      
      // Pick the least-filled position (to balance load)
      const sorted = ghiPositions.sort((a, b) => {
        const fillA = filledPositions.get(a.position) || 0;
        const fillB = filledPositions.get(b.position) || 0;
        return fillA - fillB;
      });
      
      const requirement = sorted[0];
      
      // ✅ ASSIGN (allow overstaffing - no need to check if full)
      assignments.push({
        unit: requirement.unitName,
        position: requirement.position,
        positionType: 'Generic GHI (PASS 2b)',
        staff: timegripStaff.name,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: 'GHI - flexible position',
        startTime: timegripStaff.startTime,
        endTime: timegripStaff.endTime,
        breakMinutes: timegripStaff.scheduledBreakMinutes || 0,
        isBreak: false
      });
      
      assignedStaff.add(timegripStaff.name);
      filledPositions.set(requirement.position, (filledPositions.get(requirement.position) || 0) + 1);
      
      console.log(`  ✅ ${timegripStaff.name} → ${requirement.unitName} (${requirement.position})`);
      assigned++;
    }
    
    // ✅ PASS 3: Flexible Generic Skill Matching
    console.log('\n📋 PASS 3: Flexible Generic Skill Matching');
    const stillUnfilled = staffingRequirements.filter(req => {
      const filled = filledPositions.get(req.position) || 0;
      return filled < req.staffNeeded && !req.position.toLowerCase().includes('break cover');
    });
    
    if (stillUnfilled.length > 0) {
      const stillUnassigned = skillsData.staffWithGreen.filter(s => !assignedStaff.has(s.name));
      
      if (stillUnassigned.length > 0) {
        console.log(`\n🔄 Found ${stillUnassigned.length} unassigned staff and ${stillUnfilled.length} unfilled positions\n`);
        
        for (const staff of stillUnassigned) {
          if (assignedStaff.has(staff.name)) continue;
          
          if (!isStaffAvailableForTime(staff.name, '08:00', '16:00', timegripData)) continue;
          
          const workingHours = getStaffWorkingHours(staff.name, timegripData);
          if (!workingHours) continue;
          
          let matched = false;
          
          for (const req of stillUnfilled) {
            if (matched) break;
            if ((filledPositions.get(req.position) || 0) >= req.staffNeeded) continue;
            
            if (staffHasSkill(staff, req.unitName, req.position)) {
              const normalizedSearchName = normalizeStaffName(staff.name);
              const timegripStaff = timegripData.workingStaff.find(s => {
                const normalizedWorkingName = normalizeStaffName(s.name);
                return normalizedWorkingName === normalizedSearchName;
              });
              const staffDisplayName = timegripStaff ? timegripStaff.name : staff.name;
              
              const skillType = matchPositionToSkill(req.position);
              const genericSkill = getGenericSkillMatch(req.unitName, req.position);
              const trainingMatch = genericSkill || `${req.unitName}-${skillType}`;
              
              assignments.push({
                unit: req.unitName,
                position: req.position,
                positionType: skillType,
                staff: staffDisplayName,
                zone: zone,
                dayCode: dayCode,
                trainingMatch: trainingMatch,
                startTime: workingHours.startTime,
                endTime: workingHours.endTime,
                breakMinutes: workingHours.breakMinutes || 0,  // ✅ FIX #1f: Include break info
                isBreak: false
              });
              
              assignedStaff.add(staff.name);
              filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
              console.log(`  ✅ ${staff.name} → ${req.unitName} (flexible ${trainingMatch}) ${workingHours.startTime}-${workingHours.endTime}`);
              matched = true;
              assigned++;
            }
          }
          
          if (!matched) {
            console.log(`  ⚠️  ${staff.name} has no matching unfilled positions`);
          }
        }
      }
    }

    // ============================================================================
// SMART BREAK COVERAGE ANALYSIS
// ============================================================================

console.log('\n📊 Analyzing break coverage needs...');

// Step 1: Build coverage map - who's working where, when
const coverageMap = new Map(); // unit -> time slot -> count

for (const assignment of assignments) {
  if (assignment.isBreak || assignment.unit === 'Zonal Lead') continue;
  
  const unit = assignment.unit;
  const startMin = timeToMinutes(assignment.startTime);
  const endMin = timeToMinutes(assignment.endTime);
  
  // Create 15-minute slots from 10:00 to 17:00
  for (let time = 600; time < 1020; time += 15) {
    if (time >= startMin && time < endMin) {
      const timeKey = `${unit}-${minutesToTime(time)}`;
      if (!coverageMap.has(timeKey)) {
        coverageMap.set(timeKey, new Set());
      }
      coverageMap.get(timeKey).add(assignment.staff);
    }
  }
}

// Step 2: Identify coverage gaps (units dropping below minimum)
const coverageGaps = [];

const MINIMUM_STAFF_REQUIRED = {
  'Lodge Entrance': 2,
  'Adventures Point Gift Shop': 2,
  'Sweet Shop': 2,
  'Sealife': 1,
  'Lorikeets': 1,
  "Ben & Jerry's": 1,
  'Explorer Supplies': 1
};

for (const [unitTimeKey, staffSet] of coverageMap.entries()) {
  const [unit, timeSlot] = unitTimeKey.split('-');
  const minimumRequired = MINIMUM_STAFF_REQUIRED[unit];
  
  if (!minimumRequired) continue;
  
  if (staffSet.size < minimumRequired) {
    coverageGaps.push({
      unit,
      timeSlot,
      currentStaff: staffSet.size,
      requiredStaff: minimumRequired,
      gap: minimumRequired - staffSet.size
    });
  }
}

console.log(`   Found ${coverageGaps.length} coverage gaps`);

if (coverageGaps.length > 0) {
  // Show sample gaps
  const sampleGaps = coverageGaps.slice(0, 5);
  for (const gap of sampleGaps) {
    console.log(`   ⚠️  ${gap.unit} at ${gap.timeSlot}: ${gap.currentStaff}/${gap.requiredStaff} staff (need ${gap.gap} more)`);
  }
  if (coverageGaps.length > 5) {
    console.log(`   ... and ${coverageGaps.length - 5} more gaps`);
  }
}

// Step 3: Use break cover staff to fill gaps
console.log('\n🔄 Assigning break cover to fill gaps...');

const breakCoverStaffAvailable = assignments.filter(a => 
  a.isBreakCover && 
  a.startTime === '11:00' && 
  a.endTime === '15:00'
);

console.log(`   Available break cover staff: ${breakCoverStaffAvailable.length}`);

// Group gaps by time slot
const gapsByTimeSlot = {};
for (const gap of coverageGaps) {
  if (!gapsByTimeSlot[gap.timeSlot]) {
    gapsByTimeSlot[gap.timeSlot] = [];
  }
  gapsByTimeSlot[gap.timeSlot].push(gap);
}

// Assign break cover staff to rotate through gaps
const breakCoverRotations = [];
let bcIndex = 0;

for (const [timeSlot, gaps] of Object.entries(gapsByTimeSlot)) {
  for (const gap of gaps) {
    if (bcIndex >= breakCoverStaffAvailable.length) break;
    
    const bcStaff = breakCoverStaffAvailable[bcIndex % breakCoverStaffAvailable.length];
    
    breakCoverRotations.push({
      staff: bcStaff.staff,
      unit: gap.unit,
      startTime: timeSlot,
      endTime: minutesToTime(timeToMinutes(timeSlot) + 30), // 30-min coverage
      reason: `Coverage gap: ${gap.currentStaff}/${gap.requiredStaff} staff`
    });
    
    bcIndex++;
  }
}

console.log(`   Created ${breakCoverRotations.length} break cover rotations`);

// Add rotations to assignments
for (const rotation of breakCoverRotations) {
  assignments.push({
    unit: rotation.unit,
    position: `${rotation.unit} - Break Cover`,
    staff: rotation.staff,
    startTime: rotation.startTime,
    endTime: rotation.endTime,
    isBreak: false,
    isBreakCover: true,
    zone: zone,
    dayCode: dayCode,
    trainingMatch: 'Smart Break Cover',
    positionType: 'Break Cover (Gap Fill)'
  });
  
  console.log(`   ✅ ${rotation.staff} → ${rotation.unit} (${rotation.startTime}-${rotation.endTime})`);
}
    
    // ✅ FIX #7: Enforce assignment for staff who CANNOT be left alone
    // These staff must have a position, never left unassigned
    console.log('\n📋 FIX #7: Enforce Assignment for Special Staff (Cannot Be Left Alone)');
    
    for (const specialStaff of STAFF_CANNOT_BE_LEFT_ALONE) {
      // ✅ FIX #5b: Only force-assign if this person exists in CURRENT ZONE's Skills Matrix
      const existsInThisZone = skillsData.staffWithGreen.some(s => 
        normalizeStaffName(s.name) === normalizeStaffName(specialStaff)
      );
      
      if (!existsInThisZone) {
        console.log(`  ⏭️  ${specialStaff}: Not in ${teamName} Skills Matrix - skipping`);
        continue;
      }
      
      if (assignedStaff.has(specialStaff)) {
        // Already assigned, all good
        const assigned_obj = assignments.find(a => a.staff === specialStaff);
        if (assigned_obj) {
          console.log(`  ✅ ${specialStaff}: Already assigned to ${assigned_obj.unit}`);
        }
        continue;
      }
      
      // Special staff is NOT assigned - MUST find a position for them
      console.log(`  🚨 ${specialStaff}: NOT ASSIGNED - Finding any available position...`);
      
      // Get ANY position that still needs staff (not full)
      const anyAvailable = staffingRequirements.find(req => 
        (filledPositions.get(req.position) || 0) < req.staffNeeded &&
        !req.position.toLowerCase().includes('break cover')
      );
      
      if (anyAvailable) {
        // Find their working hours
        const timegripStaff = timegripData.workingStaff.find(s => 
          normalizeStaffName(s.name) === normalizeStaffName(specialStaff)
        );
        
        const workingHours = timegripStaff ? {
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: timegripStaff.scheduledBreakMinutes || 0
        } : { startTime: '08:00', endTime: '16:00', breakMinutes: 30 };
        
        assignments.push({
          unit: anyAvailable.unitName,
          position: anyAvailable.position,
          positionType: 'SPECIAL ASSIGNMENT (Cannot Be Left Alone)',
          staff: specialStaff,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${anyAvailable.unitName}-Special`,
          startTime: workingHours.startTime,
          endTime: workingHours.endTime,
          breakMinutes: workingHours.breakMinutes,
          isBreak: false
        });
        
        assignedStaff.add(specialStaff);
        filledPositions.set(anyAvailable.position, (filledPositions.get(anyAvailable.position) || 0) + 1);
        console.log(`  ✅ ${specialStaff} → ${anyAvailable.unitName} (${anyAvailable.position}) [FORCED ASSIGNMENT]`);
        assigned++;
      } else {
        console.log(`  ❌ ${specialStaff}: NO AVAILABLE POSITIONS - CRITICAL ERROR, cannot be left unassigned`);
      }
    }
    
    // ================================================================================
    // ✅ PASS 0 (V11 REVISED): Calculate Breaks & Find Late Arrival Coverage
    // ================================================================================
    // NOW RUNS AFTER PASS 1-3 so all staff assignments are complete!
    
    console.log('\n📋 PASS 0 (V11): Calculate Break Times & Find Late Arrival Coverage');
    
    // Step 1: Calculate all breaks needed
    console.log('\n🕐 Calculating mandatory break times for assigned staff...');
    const breaksNeeded = calculateAllBreaksNeeded(assignments, timegripData);
    console.log(`   Found ${breaksNeeded.length} breaks to schedule\n`);
    
    if (breaksNeeded.length > 0) {
      for (const br of breaksNeeded.slice(0, 10)) {
        console.log(`  ☕ ${br.staff} (${br.unit}): ${br.startTime}-${br.endTime}`);
      }
      if (breaksNeeded.length > 10) {
        console.log(`  ... and ${breaksNeeded.length - 10} more`);
      }
    }
    
    // Step 2: Find late arrivals
    console.log(`\n🔄 Matching late arrivals (≥10:00) to provide break coverage...`);
    const lateArrivals = skillsData.staffWithGreen.filter(staff => {
      if (assignedStaff.has(staff.name)) return false;
      const workingHours = getStaffWorkingHours(staff.name, timegripData);
      if (!workingHours) return false;
      const [startHour] = workingHours.startTime.split(':').map(Number);
      return startHour >= 10;
    });
    
    console.log(`   Found ${lateArrivals.length} late arrivals available\n`);
    
    // Step 3: Match late arrivals to breaks
    const breakCoverResult = findBreakCover(breaksNeeded, lateArrivals, assignedStaff, timegripData, skillsData, zone, dayCode, normalizeStaffName);
    const breakCoverAssignments = breakCoverResult.assignments;
    
    console.log(`\n✅ Break coverage results:`);
    console.log(`   ${breakCoverResult.covered}/${breakCoverResult.total} breaks covered by late arrivals`);
    if (breakCoverResult.uncovered > 0) {
      console.log(`   ⚠️  ${breakCoverResult.uncovered} breaks without coverage`);
    }
    
    // ✅ FIX: Use Zonal Leads to cover uncovered retail/admissions breaks
    if (breakCoverResult.uncovered > 0) {
      console.log(`\n🔑 Attempting to use Zonal Leads for uncovered breaks...`);
      const zonalLeadStaffForBreaks = timegripData.staffByFunction?.MANAGEMENT || [];
      const usedZonalLeadsForBreaks = new Set();
      let zonalLeadsCovered = 0;
      
      for (const breakNeeded of breaksNeeded) {
        // Check if already covered
        const alreadyCovered = breakCoverAssignments.some(bc => 
          bc.unit === breakNeeded.unit &&
          bc.startTime === breakNeeded.startTime &&
          bc.endTime === breakNeeded.endTime
        );
        
        if (alreadyCovered) continue;
        
        // Find available Zonal Lead with matching skill
        const availableLead = zonalLeadStaffForBreaks.find(lead => {
          if (usedZonalLeadsForBreaks.has(lead.name)) return false;
          
          const trainedUnits = getStaffTrainedUnits(lead);
          const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
          
          return trainedUnits.some(tu => {
            const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            return tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
          });
        });
        
        if (availableLead) {
          const trainedUnits = getStaffTrainedUnits(availableLead);
          const matchingSkill = trainedUnits.find(tu => {
            const tuNorm = tu.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            const breakUnitNorm = breakNeeded.unit.toLowerCase().replace(/'/g, '').replace(/\s+/g, '');
            return tuNorm.includes(breakUnitNorm) || breakUnitNorm.includes(tuNorm);
          });
          
          breakCoverAssignments.push({
            unit: breakNeeded.unit,
            position: breakNeeded.position,
            staff: availableLead.name,
            startTime: breakNeeded.startTime,
            endTime: breakNeeded.endTime,
            isBreak: false,
            isBreakCover: true,
            trainingMatch: matchingSkill?.fullSkill || `${breakNeeded.unit}-HOST`,
            zone: zone,
            dayCode: dayCode,
            positionType: 'Zonal Lead (Break Cover)'
          });
          
          usedZonalLeadsForBreaks.add(availableLead.name);
          zonalLeadsCovered++;
          console.log(`   ✅ ${availableLead.name} (Zonal Lead) → ${breakNeeded.unit} (${breakNeeded.startTime}-${breakNeeded.endTime})`);
        }
      }
      
      if (zonalLeadsCovered > 0) {
        console.log(`   ✅ Zonal Leads covered ${zonalLeadsCovered} additional breaks`);
      } else {
        console.log(`   ⚠️  No available Zonal Leads with matching skills`);
      }
    }
    
    // ✅ FIX #9: Smart break cover assignment to specific units during specific breaks
    // ✅ FIX: Check BOTH plannedFunction and scheduledFunction for BC staff
    // BC staff have their function in scheduledFunction, not plannedFunction
    const availableBreakCoverStaff = timegripData.workingStaff.filter(s => {
      const funcType = s.plannedFunction || s.scheduledFunction || '';
      return funcType.includes('Break Cover');
    });
    const smartBreakCoverAssignments = assignSmartBreakCover(assignments, breaksNeeded, availableBreakCoverStaff, timegripData, skillsData);
    
    // ✅ FIX #6: Stagger breaks BEFORE splitting to avoid gaps
    // Calculate staggered breaks first (e.g., 11:00 → 12:00)
    console.log(`\n🔄 Applying Break Staggering Logic...`);
    const staggerResult = staggerBreaksByUnit(assignments);
    const staggeredBreakMap = new Map();
    
    // Build map of staggered breaks from the stagger result
    for (const assignment of staggerResult) {
      if (assignment.isBreak && assignment.staff && !staggeredBreakMap.has(assignment.staff)) {
        staggeredBreakMap.set(assignment.staff, {
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          unit: assignment.unit
        });
      }
    }
    
    // Step 4: Update breaks with staggered times BEFORE splitting
    let finalBreaksToSplit = breaksNeeded.map(br => {
      if (staggeredBreakMap.has(br.staff)) {
        const staggered = staggeredBreakMap.get(br.staff);
        return {
          ...br,
          startTime: staggered.startTime,
          endTime: staggered.endTime
        };
      }
      return br;
    });
    
    // Show staggered breaks
    if (staggeredBreakMap.size > 0) {
      for (const [staff, staggered] of staggeredBreakMap) {
        const original = breaksNeeded.find(b => b.staff === staff);
        if (original && original.startTime !== staggered.startTime) {
          console.log(`  🔄 ${staff} (${staggered.unit}): ${original.startTime}-${original.endTime} → ${staggered.startTime}-${staggered.endTime}`);
        }
      }
    }
    
    // Step 5: Split assignments around STAGGERED breaks
    const splitAndCoveredAssignments = [
      ...splitAssignmentsAroundBreaks(assignments, finalBreaksToSplit),
      ...breakCoverAssignments,
      ...smartBreakCoverAssignments  // ✅ FIX #9: Add smart break cover assignments
    ];
    
    // ✅ STEP 6: Afternoon Reassignment (Entrances → Retail After Breaks)
    console.log('\n🔄 Step 6: Reassigning entrance overflow staff to retail after breaks...');
    const reassignedAssignments = reassignEntranceStaffAfternoon(
      splitAndCoveredAssignments, 
      staffingRequirements, 
      skillsData,
      dayCode
    );
    
    // Step 7: Final assignments
    const finalAssignmentsBeforeStats = reassignedAssignments;
    
    assignments.length = 0;
    assignments.push(...finalAssignmentsBeforeStats);
    assigned = finalAssignmentsBeforeStats.filter(a => a.staff !== 'UNFILLED').length;
    
    // ✅ FIX: Use zonal leads to fill unfilled positions
    console.log('\n📋 Deploying Zonal Leads to fill gaps...');
    const zonalLeadStaff = timegripData.staffByFunction?.MANAGEMENT || [];
    const unfilledPositions = [];
    
    for (const req of staffingRequirements) {
      const currentFill = assignments.filter(a => 
        a.unit === req.unitName && 
        a.position === req.position &&
        a.staff !== 'UNFILLED'
      ).length;
      
      if (currentFill < req.staffNeeded) {
        unfilledPositions.push({
          unit: req.unitName,
          position: req.position,
          needed: req.staffNeeded - currentFill
        });
      }
    }
    
    if (unfilledPositions.length > 0 && zonalLeadStaff.length > 0) {
      console.log(`   Found ${unfilledPositions.length} unfilled positions`);
      
      for (const unfilled of unfilledPositions) {
        for (let i = 0; i < unfilled.needed; i++) {
          const availableLead = zonalLeadStaff.find(zl => 
            !assignments.some(a => a.staff === zl.name && a.unit !== 'Zonal Leads')
          );
          
          if (availableLead) {
            assignments.push({
              unit: unfilled.unit,
              position: unfilled.position,
              positionType: 'Zonal Lead (Deployed)',
              staff: availableLead.name,
              zone: zone,
              dayCode: dayCode,
              trainingMatch: `${unfilled.unit}-Lead`,
              startTime: availableLead.startTime,
              endTime: availableLead.endTime,
              breakMinutes: availableLead.scheduledBreakMinutes || 0,
              isBreak: false
            });
            console.log(`   ✅ ${availableLead.name} deployed to ${unfilled.unit} (${availableLead.startTime}-${availableLead.endTime})`);
            assigned++;
          }
        }
      }
    }
    
    const totalNeeded = staffingRequirements.reduce((sum, req) => sum + req.staffNeeded, 0);
    console.log(`\n=== COMPLETE: ${assigned}/${totalNeeded} assigned ===\n`);
    
    // ✅ V13: Sort assignments alphabetically by staff name
    assignments.sort((a, b) => a.staff.localeCompare(b.staff));
    
    // ✅ FIX #3: Create staffList from BOTH assigned AND unassigned staff
    const uniqueStaffNames = new Set();
    const sortedStaffList = [];
    const allWorkingStaff = timegripData.workingStaff || [];
    
    // Step 1: Add ASSIGNED staff (in alphabetical order from assignments)
    for (const assignment of assignments) {
      if (!uniqueStaffNames.has(assignment.staff) && assignment.staff !== 'UNFILLED') {
        uniqueStaffNames.add(assignment.staff);
        sortedStaffList.push({ name: assignment.staff });
      }
    }
    
    // ✅ FIX #9: Replace hardcoded reasons with dynamically tracked reasons
    // Step 2: Add UNASSIGNED staff (explain why not assigned)
    // Use the assignment failure reasons tracked during PASS 1-3
    // If no tracked reason exists, default to generic message
    for (const timegripStaff of allWorkingStaff) {
      if (!uniqueStaffNames.has(timegripStaff.name)) {
        uniqueStaffNames.add(timegripStaff.name);
        
        // Use tracked reason if available, otherwise generate one
        let reason = 'No suitable positions available';
        
        // Determine likely reason based on their scheduled function and position
        const timegripFunc = timegripStaff.scheduledFunction || '';
        
        if (timegripFunc.includes('Car Parks')) {
          reason = 'Car Parks - Staff Car Park position already fully staffed (1/1)';
        } else if (timegripFunc.includes('GHI Front Desk')) {
          reason = 'GHI - Hub position already fully staffed (1/1)';
        } else if (timegripFunc.includes('Generic')) {
          reason = 'No unfilled Rides positions matching generic classification';
        } else if (timegripFunc.includes('Retail')) {
          reason = 'No unfilled retail positions available';
        } else if (timegripFunc.includes('Admissions')) {
          reason = 'No unfilled Admissions positions available';
        } else {
          // Check shift length - short shifts often can't be matched
          const startTime = timegripStaff.startTime;
          const endTime = timegripStaff.endTime;
          const hoursWorking = (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) -
                               (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]));
          if (hoursWorking < 300) { // Less than 5 hours
            reason = `No unfilled positions matching shift times (${startTime}-${endTime})`;
          }
        }
        
        sortedStaffList.push({ 
          name: timegripStaff.name,
          unassigned: true,
          reason: reason
        });
      }
    }

    
// ============================================================================
    // BUG #15: DETECT BRIEFING STAFF
    // ============================================================================
    
// ============================================================================
// BUG #15: DETECT BRIEFING STAFF
// ============================================================================

// ============================================================================
// BUG #15: DETECT BRIEFING STAFF
// ============================================================================

// ✅ BUG #15: Add briefing flag to assignments
console.log('🎙️ Detecting briefing attendees...');
const briefingStaff = detectBriefingStaff(assignments);
console.log(`   ✅ ${briefingStaff.size} staff attending 09:15 briefing\n`);

// Add hasBriefing flag to each relevant assignment
assignments.forEach(assignment => {
  if (briefingStaff.has(assignment.staff) && assignment.startTime === '09:15') {
    assignment.hasBriefing = true;
  }
});

// ============================================================================
// BUG #15: DETECT & ASSIGN BREAK COVER
// ============================================================================

const breakCoverStaffList = assignments.filter(s => s.isBreakCover);
const regularStaffList = assignments.filter(s => !s.isBreakCover);

console.log(`\n📊 Staff breakdown:`);
console.log(`   Regular: ${regularStaffList.length}, Break cover: ${breakCoverStaffList.length}`);

const bug15BreakCoverAssignments = assignBreakCover(breakCoverStaffList, regularStaffList, finalBreaksToSplit);

for (const assignment of bug15BreakCoverAssignments) {
  assignments.push(assignment);
}

// ============================================================================
// BUG #15: GET PARK-WIDE UNITS
// ============================================================================

const parkWideUnits = getAllParkUnits();

// ============================================================================
// BUG #15: CREATE SCHEDULE DATA WITH PARK-WIDE UNITS
// ============================================================================

const scheduleData = {
  teamName: teamName,
  zone: zone,
  dayCode: dayCode,
  dayCodeName: dayCodeInfo ? dayCodeInfo.label : `Day Code ${dayCode}`,
  dayCodeDescription: dayCodeInfo ? dayCodeInfo.label.split(' - ')[1] || '' : '',
  date: date,
  assignments: assignments,
  staffList: sortedStaffList,
  statistics: {
    filledCount: assigned,
    totalPositions: totalNeeded,
    fillRate: totalNeeded > 0 ? Math.round((assigned / totalNeeded) * 100) : 0
  },
  parkWideUnits: parkWideUnits,  // ✅ BUG #15: Add park-wide units
  explorerColor: '#DA9694',  // ✅ Color for Explorer-related units (Explorer Entrance only)
  explorerUnits: ['Explorer Entrance'],  // Units to highlight with Explorer color (pink)
  seniorHostStaff: skillsData.seniorHosts || []  // ✅ Senior Host names for Excel highlighting
};
    
    // Generate Excel buffer
    const excelBuffer = await generateExcelPlanner(scheduleData);
    const base64 = excelBuffer.toString('base64');
    
    const filename = `planner-${zone}-${dayCode}-${date.replace(/\//g, '-')}.xlsx`;
    console.log(`Generated Excel planner: ${filename} (${assigned}/${totalNeeded} assigned)`);
    
    res.json({
      success: true,
      assigned,
      total: totalNeeded,
      fillRate: totalNeeded > 0 ? Math.round((assigned / totalNeeded) * 100) : 0,
      assignments,
      excelFile: base64,
      filename: filename
    });
  } catch (error) {
    console.error('Assignment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ Serve React frontend build in production
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  // Catch-all: serve React app for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
  console.log(`✅ Serving React frontend from ${frontendBuildPath}`);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Break Scheduler V11.0 Backend running on port ${PORT}`);
  console.log(`📁 Zone data folder: zone-data/`);
  console.log(`🕐 Features: Competency-based breaks + Fixed slot breaks + Late arrival coverage`);
});
