const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
const { reassignEntranceStaffAfternoon } = require('./services/assignments/afternoonEntranceReassignment');
const { analyzeBreakCoverageSmart } = require('./services/enforcement/breakCoverageGapAnalysis');
const { enforceSpecialStaffAssignment } = require('./services/utilities/specialStaffEnforcement');
const { scheduleBreaksWithCoverage } = require('./services/enforcement/breakSchedulingPass0');

const { 
  timeToMinutes, 
  minutesToTime,
} = require('./utils/breakCalculator');
const {
  normalizeStaffName,
  isStaffAvailableForTime,
  getStaffWorkingHours
} = require('./utils/staffTimegripUtils');
const { STAFF_CANNOT_BE_LEFT_ALONE } = require('./config/constants');
const { ZONE_FILES } = require('./config/zoneFiles');
const {
  normalizeTeamKey,
  canonicalizeUnitName,
  getExcludedUnitsForTeam,
  filterUnitsForTeam,
  getCategoryFromUnit
} = require('./utils/unitHelpers');
const {
  matchPositionToSkill,
  getStaffTrainedUnits,
  getGenericSkillMatch,
  staffHasSkill,
  hasSkillForUnit
} = require('./utils/skillHelpers');
const {
  getClosedDaysStatus,
  getUnitsWithStatus,
  getAllParkUnits
} = require('./services/utilities/zoneUnitStatusService');

const VERBOSE_API_LOGS = process.env.VERBOSE_API_LOGS === 'true';
const app = express();
const upload = multer({ dest: 'uploads/' });

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
    const { teamName, zone, date, dayCode } = req.body;
    
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
    const units = filterUnitsForTeam(getUnitsWithStatus(zoneFilePath, date, dayCode), teamName);
    
    const categoryNames = Object.keys(units);
    const totalUnits = categoryNames.reduce((sum, category) => sum + units[category].length, 0);
    console.log(`✅ Returning units for zone ${zone}: ${categoryNames.length} categories, ${totalUnits} units`);
    if (VERBOSE_API_LOGS) {
      console.log(`   Categories: ${categoryNames.join(', ')}`);
      Object.entries(units).forEach(([category, unitList]) => {
        console.log(`   ${category}: ${unitList.map(u => u.name).join(', ')}`);
      });
    }
    
    res.json({
      success: true,
      units: units,
      teamName: teamName,
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
    
    console.log(`📊 Staffing requirements for ${zone} - Day Code ${dayCode}: ${staffingRequirements.length} positions`);
    if (VERBOSE_API_LOGS) {
      staffingRequirements.forEach(req => {
        console.log(`  ${req.unitName} (${req.position}): ${req.staffNeeded} staff needed`);
      });
    }
    
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
    const excludedUnitsForTeam = getExcludedUnitsForTeam(teamName);
    const sanitizedSelectedUnits = selectedUnitsArray.filter((unitName) => !excludedUnitsForTeam.has(canonicalizeUnitName(unitName)));
    if (sanitizedSelectedUnits.length !== selectedUnitsArray.length) {
      console.log(`   Excluded ${selectedUnitsArray.length - sanitizedSelectedUnits.length} unit(s) not valid for ${normalizeTeamKey(teamName) || 'selected team'}`);
    }
    const selectedUnitsCanonical = [...new Set(sanitizedSelectedUnits.map(canonicalizeUnitName))];
    if (sanitizedSelectedUnits.length > 0) {
      console.log(`\n🔍 Filtering staffing requirements...`);
      console.log(`   Selected units from frontend: ${sanitizedSelectedUnits.join(', ')}`);
      
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
    const reassignedAssignments = reassignEntranceStaffAfternoon({
      assignments: splitAndCoveredAssignments,
      staffingRequirements,
      skillsData,
      dayCode,
      timeToMinutes,
      hasSkillForUnit
    });
    
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
    const staffedRequiredSlots = staffingRequirements.reduce((sum, requirement) => {
      const matchingAssignments = assignments.filter((assignment) =>
        assignment.unit === requirement.unitName &&
        assignment.position === requirement.position &&
        assignment.staff !== 'UNFILLED' &&
        !assignment.isBreak
      );
      const uniqueStaffForRequirement = new Set(matchingAssignments.map((assignment) => assignment.staff));
      return sum + Math.min(requirement.staffNeeded, uniqueStaffForRequirement.size);
    }, 0);
    console.log(`\n=== COMPLETE: ${staffedRequiredSlots}/${totalNeeded} required positions filled ===\n`);
    
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

const parkWideUnits = getAllParkUnits(ZONE_FILES);

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
    filledCount: staffedRequiredSlots,
    totalPositions: totalNeeded,
    fillRate: totalNeeded > 0 ? Math.round((staffedRequiredSlots / totalNeeded) * 100) : 0
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
    console.log(`Generated Excel planner: ${filename} (${staffedRequiredSlots}/${totalNeeded} required positions filled)`);
    
    res.json({
      success: true,
      assigned: staffedRequiredSlots,
      total: totalNeeded,
      fillRate: totalNeeded > 0 ? Math.round((staffedRequiredSlots / totalNeeded) * 100) : 0,
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
