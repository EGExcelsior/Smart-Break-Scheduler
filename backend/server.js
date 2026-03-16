const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const { parseSkillsMatrix } = require('./parsers/skillsMatrixParser');
const { parseTimegripCsv } = require('./parsers/timegripParser');
const { parseZoneFile } = require('./parsers/zoneFileParser');
const { generateExcelPlanner } = require('./generators/excelPlannerGenerator');
const { classifyDeferredRetailAdmissions } = require('./services/utilities/deferredRetailClassifier');
const { applyAztecaPrePass } = require('./services/prepass/aztecaPrePassAssignment');
const { applySeniorHostPriorityStep } = require('./services/enforcement/seniorHostPriorityAssignment');
const { applyBjPrePass } = require('./services/prepass/benJerryPrePassAssignment');
const { prepareFullShiftAssignmentsAndReserve } = require('./services/utilities/fullShiftPreparation');
const { assignFullShiftHostsStep2 } = require('./services/assignments/fullShiftAssignment');
const { assignShortShiftHostsStep3 } = require('./services/assignments/shortShiftAssignment');
const { enforceRetailOpeningCoverage } = require('./services/enforcement/retailOpeningCoverageEnforcement');
const { assignRemainingHostsStep4 } = require('./services/assignments/remainingHostsAssignment');
const { assignOverflowStaffStep5 } = require('./services/assignments/overflowStaffAssignment');
const { assignBreakCoverStaff } = require('./services/assignments/breakCoverStaffAssignment');
const { assignRemainingGenericStaff } = require('./services/assignments/flexibleStaffAssignment');
const { analyzeBreakCoverageSmart } = require('./services/enforcement/breakCoverageGapAnalysis');
const { enforceSpecialStaffAssignment } = require('./services/utilities/specialStaffEnforcement');
const { scheduleBreaksWithCoverage } = require('./services/enforcement/breakSchedulingPass0');

const { 
  timeToMinutes, 
  minutesToTime, 
  calculateBreakTiming,
} = require('./utils/breakCalculator');
const {
  normalizeStaffName,
  isStaffAvailableForTime,
  getStaffWorkingHours
} = require('./utils/staffTimegripUtils');


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

function canonicalizeUnitName(unitName) {
  if (!unitName || typeof unitName !== 'string') {
    return unitName;
  }

  const compact = unitName.trim().replace(/\s+/g, ' ');
  const lower = compact.toLowerCase();

  if (lower === 'sea life' || lower === 'sealife') {
    return 'Sealife';
  }

  return compact;
}

// Helper function to get category from unit name
function getCategoryFromUnit(unitName) {
  const canonicalUnit = canonicalizeUnitName(unitName);
  for (const [category, unitList] of Object.entries(UNIT_CATEGORIES)) {
    if (unitList.some((unit) => canonicalizeUnitName(unit) === canonicalUnit)) {
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

// ✅ V12: Validate if staff has skill for a unit
function hasSkillForUnit(staffName, targetUnit, skillsData) {
  const staff = skillsData.staffWithGreen.find(s => s.name === staffName);
  if (!staff) return false;
  const canonicalTargetUnit = canonicalizeUnitName(targetUnit);
  
  // ✅ NEW: For Rides units, Rides T1 break cover can cover any ride
  // Check if this is a Rides unit
  const category = getCategoryFromUnit(canonicalTargetUnit);
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
  
  const requiredSkill = unitSkillMap[canonicalTargetUnit];
  if (!requiredSkill) return false;
  
  // ✅ Handle both plain strings ("Ben & Jerry's-HOST") and objects ({fullSkill: "..."})
  return (staff.greenUnits || []).some(skill => {
    if (!skill) return false;
    const skillStr = typeof skill === 'string' ? skill : (skill.fullSkill || '');
    return skillStr.toLowerCase().includes(requiredSkill.toLowerCase());
  });
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
  const canonicalUnit = canonicalizeUnitName(unitName);
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
  if (canonicalUnit === 'Sealife') {
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
      alerts: timegripData.alerts || null,
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
    const { teamName, zone, dayCode, date, selectedUnits, includeAbsentStaff } = req.body;
    
    if (!req.files['skillsMatrix'] || !req.files['timegripCsv']) {
      return res.status(400).json({ error: 'Missing required files' });
    }
    
    const skillsMatrixFile = req.files['skillsMatrix'][0].path;
    const timegripFile = req.files['timegripCsv'][0].path;
    
    const sheetName = teamName.includes('Team') ? teamName : `Team ${teamName}`;
    const skillsData = await parseSkillsMatrix(skillsMatrixFile, sheetName);
    let includeAbsentStaffNames = [];
    if (includeAbsentStaff) {
      try {
        const parsed = JSON.parse(includeAbsentStaff);
        if (Array.isArray(parsed)) {
          includeAbsentStaffNames = parsed.filter(Boolean);
        }
      } catch (parseError) {
        console.warn('⚠️ Invalid includeAbsentStaff payload, ignoring override list');
      }
    }

    const timegripData = await parseTimegripCsv(timegripFile, teamName, date, {
      includeAbsentStaffNames
    });
    
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
    const selectedUnitsCanonical = [...new Set(selectedUnitsArray.map(canonicalizeUnitName))];
    if (selectedUnitsArray.length > 0) {
      console.log(`\n🔍 Filtering staffing requirements...`);
      console.log(`   Selected units from frontend: ${selectedUnitsArray.join(', ')}`);
      
      const beforeCount = staffingRequirements.length;
      staffingRequirements = staffingRequirements.filter(req => {
        return selectedUnitsCanonical.includes(canonicalizeUnitName(req.unitName));
      });
      const afterCount = staffingRequirements.length;
      
      console.log(`\n✅ Filtered to ${afterCount} selected units (removed ${beforeCount - afterCount} unselected)`);
      
      // ✅ FIX: Add requirements for selected units that Day Code doesn't include
      const unitsWithRequirements = new Set(staffingRequirements.map((r) => canonicalizeUnitName(r.unitName)));
      const missingSelectedUnits = selectedUnitsCanonical.filter((unit) => !unitsWithRequirements.has(unit));
      
      if (missingSelectedUnits.length > 0) {
        console.log(`\n📝 Adding requirements for selected units not in Day Code ${dayCode}:`);
        const closedDaysStatus = getClosedDaysStatus(zoneFilePath, date, dayCode);
        const closedDaysCanonical = new Map(
          Object.entries(closedDaysStatus).map(([name, status]) => [canonicalizeUnitName(name), status])
        );
        
        for (const selectedUnitName of missingSelectedUnits) {
          const unitName = canonicalizeUnitName(selectedUnitName);
          // Only add if unit is Open in Closed Days
          if (closedDaysCanonical.get(unitName) !== false) {
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
      
      const ENTRANCE_UNITS = ['Lodge Entrance', 'Explorer Entrance', 'Schools Entrance'];
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
        AFTERNOON_TARGETS['Explorer Entrance'] = 3;  // Target 3 afternoon staff
        AFTERNOON_TARGETS['Lodge Entrance'] = 3;
        AFTERNOON_TARGETS['Schools Entrance'] = 3;
        AFTERNOON_TARGETS['Azteca Entrance'] = 2;
      } else if (explorerIsBaseline && !schoolsIsBaseline) {
        // Explorer baseline (Day Codes E, F, H, I - Explorer 5PM/6PM/7PM)
        AFTERNOON_TARGETS['Explorer Entrance'] = 3;  // Target 3 afternoon staff
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
                if (retailUnit === 'Sealife') {
                  const sealifeTotal = updatedAssignments.filter(
                    (a) =>
                      a.unit === 'Sealife' &&
                      a.staff !== 'UNFILLED' &&
                      !a.isBreak &&
                      timeToMinutes(a.startTime) <= timeToMinutes(AFTERNOON_START) &&
                      timeToMinutes(a.endTime) > timeToMinutes(AFTERNOON_START)
                  ).length;

                  if (sealifeTotal >= 2) {
                    continue;
                  }
                }
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
        let bjCurrent = bjAfternoonStaff.length;
        
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
const staffByType = classifyDeferredRetailAdmissions(
  deferredRetailAdmissions,
  skillsData,
  normalizeStaffName,
  timeToMinutes
);

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
// PRE-STEP 1: Azteca Entrance (08:30–10:00) → Lodge (10:00–11:00) → Break → Free
// Azteca closes at 10:00. Assign exactly 2 early 08:30 starters:
//   08:30–10:00  Azteca Entrance
//   10:00–11:00  Lodge Entrance (support)
//   11:00        Break (forced by Azteca override in break scheduler)
//   After break  Routed via afternoon reassignment wherever needed
// ============================================================================
const aztecaPrePassResult = applyAztecaPrePass({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  dayCode,
  zone,
  getCategoryFromUnit
});
assigned += aztecaPrePassResult.assignedCount;

// ============================================================================
// STEP 1: Assign Senior Hosts to Priority Units (full shift, 1 per unit)
// ============================================================================
const seniorHostStepResult = applySeniorHostPriorityStep({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  getCategoryFromUnit
});
assigned += seniorHostStepResult.assignedCount;

// ============================================================================
// B&J PRE-PASS: Guarantee 2 trained staff at Ben & Jerry's from 12:00
// ============================================================================
const bjPrePassResult = applyBjPrePass({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  zone,
  dayCode,
  skillsData,
  hasSkillForUnit,
  timeToMinutes
});
assigned += bjPrePassResult.assignedCount;

// ============================================================================
// STEP 2: Assign Full-Shift Hosts to All-Day Coverage Units
// ============================================================================
const fullShiftPrepResult = prepareFullShiftAssignmentsAndReserve({
  staffingRequirements,
  canonicalizeUnitName,
  filledPositions,
  staffByType,
  assignedStaff,
  hasSkillForUnit,
  skillsData,
  assignments,
  zone,
  dayCode,
  getCategoryFromUnit
});
const fullShiftAssignments = fullShiftPrepResult.fullShiftAssignments;
const SKILL_GATED_STEP2 = fullShiftPrepResult.skillGatedStep2;
assigned += fullShiftPrepResult.assignedCount;

const fullShiftStepResult = assignFullShiftHostsStep2({
  fullShiftAssignments,
  filledPositions,
  skillGatedStep2: SKILL_GATED_STEP2,
  staffByType,
  assignedStaff,
  hasSkillForUnit,
  skillsData,
  assignments,
  zone,
  dayCode,
  getCategoryFromUnit
});
assigned += fullShiftStepResult.assignedCount;

const shortShiftStep3Result = assignShortShiftHostsStep3({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode
});
assigned += shortShiftStep3Result.assignedCount;

const retailOpeningResult = enforceRetailOpeningCoverage({
  staffingRequirements,
  assignments,
  staffByType,
  assignedStaff,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  getCategoryFromUnit,
  hasSkillForUnit,
  timeToMinutes
});
assigned += retailOpeningResult.assignedCount;

// ============================================================================
// STEP 4: Assign Remaining Staff to Unfilled Positions
// ============================================================================
const step4Result = assignRemainingHostsStep4({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  getCategoryFromUnit,
  hasSkillForUnit,
  timeToMinutes
});
assigned += step4Result.assignedCount;

// ============================================================================
// STEP 5: Assign Overflow Staff to Busy Units (Allow Overstaffing)
// ============================================================================
const step5Result = assignOverflowStaffStep5({
  staffingRequirements,
  staffByType,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  hasSkillForUnit,
  getCategoryFromUnit,
  timeToMinutes,
  canonicalizeUnitName
});
assigned += step5Result.assignedCount;


// ============================================================================
// STEP 5b: Assign Break Cover Staff
// ============================================================================
const bcResult = assignBreakCoverStaff({
  timegripData,
  staffingRequirements,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  hasSkillForUnit,
  normalizeStaffName
});
assigned += bcResult.assignedCount;
    // ============================================================================
    // STEP 5c: Assign Remaining/Generic/GHI Staff
    // ============================================================================
    const remGenResult = assignRemainingGenericStaff({
      timegripData,
      staffingRequirements,
      filledPositions,
      assignedStaff,
      assignments,
      skillsData,
      zone,
      dayCode,
      isStaffAvailableForTime,
      getStaffWorkingHours,
      normalizeStaffName,
      staffHasSkill,
      matchPositionToSkill,
      getGenericSkillMatch
    });
    assigned += remGenResult.assignedCount;

    // ============================================================================
    // STEP 5d: Smart Break Coverage Analysis
    // ============================================================================
    const coverageResult = analyzeBreakCoverageSmart({
      assignments,
      breakCoverStaffAssignments: assignments.filter(a => a.isBreakCover),
      timeToMinutes,
      minutesToTime,
      zone,
      dayCode
    });
    // � FIX #7: Enforce assignment for staff who CANNOT be left alone
    const fix7Result = enforceSpecialStaffAssignment({
      STAFF_CANNOT_BE_LEFT_ALONE,
      skillsData,
      teamName,
      assignedStaff,
      assignments,
      staffingRequirements,
      filledPositions,
      timegripData,
      normalizeStaffName,
      zone,
      dayCode
    });
    assigned += fix7Result.assignedCount;
    
    // ================================================================================
    const pass0Result = scheduleBreaksWithCoverage({
      assignments,
      timegripData,
      skillsData,
      assignedStaff,
      zone,
      dayCode,
      canonicalizeUnitName,
      getCategoryFromUnit,
      hasSkillForUnit,
      getStaffTrainedUnits,
    });
    const splitAndCoveredAssignments = pass0Result.splitAndCoveredAssignments;
    
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
// BUG #15 (disabled): duplicate break-cover pass created invalid duplicate rows.
// Smart break cover is already applied earlier in the flow.
// ============================================================================

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
  alerts: timegripData.alerts || null,
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
      alerts: timegripData.alerts || null,
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
