const express = require('express');
const fs = require('fs');

const { parseSkillsMatrix } = require('../parsers/skillsMatrixParser');
const { parseTimegripCsv } = require('../parsers/timegripParser');
const { parseZoneFile } = require('../parsers/zoneFileParser');
const { generateExcelPlanner } = require('../generators/excelPlannerGenerator');
const { classifyDeferredRetailAdmissions } = require('../services/utilities/deferredRetailClassifier');
const { applyAztecaPrePass } = require('../services/prepass/aztecaPrePassAssignment');
const { applySeniorHostPriorityStep } = require('../services/enforcement/seniorHostPriorityAssignment');
const { applyBjPrePass } = require('../services/prepass/benJerryPrePassAssignment');
const { prepareFullShiftAssignmentsAndReserve } = require('../services/utilities/fullShiftPreparation');
const { assignFullShiftHostsStep2 } = require('../services/assignments/fullShiftAssignment');
const { assignShortShiftHostsStep3 } = require('../services/assignments/shortShiftAssignment');
const { enforceRetailOpeningCoverage } = require('../services/enforcement/retailOpeningCoverageEnforcement');
const { assignRemainingHostsStep4 } = require('../services/assignments/remainingHostsAssignment');
const { assignOverflowStaffStep5 } = require('../services/assignments/overflowStaffAssignment');
const { assignBreakCoverStaff } = require('../services/assignments/breakCoverStaffAssignment');
const { assignRemainingGenericStaff } = require('../services/assignments/flexibleStaffAssignment');
const { reassignEntranceStaffAfternoon } = require('../services/assignments/afternoonEntranceReassignment');
const { analyzeBreakCoverageSmart } = require('../services/enforcement/breakCoverageGapAnalysis');
const { enforceSpecialStaffAssignment } = require('../services/utilities/specialStaffEnforcement');
const { scheduleBreaksWithCoverage } = require('../services/enforcement/breakSchedulingPass0');
const { timeToMinutes, minutesToTime } = require('../utils/breakCalculator');
const {
  normalizeStaffName,
  isStaffAvailableForTime,
  getStaffWorkingHours
} = require('../utils/staffTimegripUtils');
const { STAFF_CANNOT_BE_LEFT_ALONE } = require('../config/constants');
const { ZONE_FILES } = require('../config/zoneFiles');
const {
  normalizeTeamKey,
  canonicalizeUnitName,
  getExcludedUnitsForTeam,
  getCategoryFromUnit
} = require('../utils/unitHelpers');
const {
  matchPositionToSkill,
  getStaffTrainedUnits,
  getGenericSkillMatch,
  staffHasSkill,
  hasSkillForUnit
} = require('../utils/skillHelpers');
const {
  getClosedDaysStatus,
  getAllParkUnits
} = require('../services/utilities/zoneUnitStatusService');
const { detectBriefingStaff } = require('../utils/assignmentMeta');
const { getSpecificUnitFromFunction } = require('../utils/plannedFunctionMapper');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/asyncHandler');

const router = express.Router();

const sanitizeFileNameSegment = (value) => {
  if (!value) {
    return 'Unknown';
  }

  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'Unknown';
};

const formatDateForFileName = (inputDate) => {
  if (!inputDate) {
    return 'Unknown-Date';
  }

  const rawDate = String(inputDate).trim();
  const splitBySlashOrDash = rawDate.split(/[/-]/).map((part) => part.trim());

  if (splitBySlashOrDash.length === 3) {
    const [first, second, third] = splitBySlashOrDash;
    if (first.length === 4) {
      return `${third.padStart(2, '0')}-${second.padStart(2, '0')}-${first}`;
    }
    if (third.length === 4) {
      return `${first.padStart(2, '0')}-${second.padStart(2, '0')}-${third}`;
    }
  }

  const parsedDate = new Date(rawDate);
  if (!Number.isNaN(parsedDate.getTime())) {
    const day = String(parsedDate.getDate()).padStart(2, '0');
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const year = parsedDate.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return sanitizeFileNameSegment(rawDate);
};

router.post('/auto-assign', upload.fields([
  { name: 'skillsMatrix', maxCount: 1 },
  { name: 'timegripCsv', maxCount: 1 }
]), asyncHandler(async (req, res) => {
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
      staffingRequirements = staffingRequirements.filter(reqItem => selectedUnitsCanonical.includes(canonicalizeUnitName(reqItem.unitName)));
      const afterCount = staffingRequirements.length;

      console.log(`\n✅ Filtered to ${afterCount} selected units (removed ${beforeCount - afterCount} unselected)`);

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
          if (closedDaysCanonical.get(unitName) !== false) {
            const category = getCategoryFromUnit(unitName);

            if (category === 'Rides') {
              const isOperator = ['Adventure Tree', 'Tiny Truckers', "Griffin's Galeon", 'Sea Dragons', "Elmer's Flying Jumbos"].includes(unitName);
              const position = isOperator ? `${unitName}Operator` : `${unitName}Attendant`;
              staffingRequirements.push({ unitName, position, staffNeeded: 1 });
              console.log(`   ✅ Added: ${unitName} (${position})`);
            } else if (category === 'Admissions') {
              staffingRequirements.push({ unitName, position: 'Admissions Senior Host', staffNeeded: 1 });
              staffingRequirements.push({ unitName, position: 'Admissions Host', staffNeeded: 1 });
              console.log(`   ✅ Added: ${unitName} (Admissions Senior Host + Host)`);
            } else if (category === 'Car Parks') {
              staffingRequirements.push({ unitName, position: 'Car Parks - Host', staffNeeded: 1 });
              console.log(`   ✅ Added: ${unitName} (Car Parks - Host)`);
            } else if (category === 'GHI') {
              staffingRequirements.push({ unitName, position: 'GHI Senior Host', staffNeeded: 1 });
              staffingRequirements.push({ unitName, position: 'GHI Front_Desk_Host', staffNeeded: 1 });
              console.log(`   ✅ Added: ${unitName} (GHI Senior Host + Front Desk Host)`);
            } else if (category === 'Retail') {
              staffingRequirements.push({ unitName, position: 'Retail - Senior Host', staffNeeded: 1 });
              staffingRequirements.push({ unitName, position: 'Retail Host', staffNeeded: 1 });
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

    staffingRequirements.forEach(reqItem => {
      filledPositions.set(reqItem.position, 0);
    });

    console.log(`\n🔑 Identifying Zonal Leads from Skills Matrix...`);
    const zonalLeadNames = skillsData.zonalLeads || [];
    console.log(`   Found ${zonalLeadNames.length} zonal leads in Skills Matrix: ${zonalLeadNames.slice(0, 5).join(', ')}`);

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

    const allZonalLeadNames = new Set([...zonalLeadNames, ...timegripZonalLeads]);
    console.log(`\n🔑 Total unique Zonal Leads (Skills Matrix + TimeGrip): ${allZonalLeadNames.size}`);
    console.log(`   Combined list: ${Array.from(allZonalLeadNames).join(', ')}`);

    const zonalLeadStaffFromMatrix = skillsData.staffWithGreen.filter(staff => {
      const normalized = normalizeStaffName(staff.name);
      return Array.from(allZonalLeadNames).some(lead => normalizeStaffName(lead) === normalized);
    });

    const zonalLeadsToProcess = [...zonalLeadStaffFromMatrix];
    for (const leadName of timegripZonalLeads) {
      const normalizedLead = normalizeStaffName(leadName);
      const alreadyInList = zonalLeadsToProcess.some(s => normalizeStaffName(s.name) === normalizedLead);

      if (!alreadyInList) {
        zonalLeadsToProcess.push({ name: leadName, skills: [] });
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
      let timegripStaff = null;
      if (timegripData.staffByFunction?.MANAGEMENT) {
        timegripStaff = timegripData.staffByFunction.MANAGEMENT.find(s => normalizeStaffName(s.name) === normalizedSearchName);
      }

      if (!timegripStaff) {
        timegripStaff = timegripData.workingStaff.find(s => normalizeStaffName(s.name) === normalizedSearchName);
      }

      const staffDisplayName = timegripStaff ? timegripStaff.name : staff.name;

      assignments.push({
        unit: 'Zonal Lead',
        position: 'Zonal Leads',
        positionType: 'Roaming',
        staff: staffDisplayName,
        zone,
        dayCode,
        trainingMatch: 'Zonal Lead',
        startTime: workingHours.startTime,
        endTime: workingHours.endTime,
        breakMinutes: workingHours.breakMinutes || 0,
        isBreak: false
      });

      assignedStaff.add(staff.name);
      console.log(`  ✅ ${staff.name} assigned as Zonal Lead (Roaming) ${workingHours.startTime}-${workingHours.endTime}`);
      assigned++;
    }

    console.log('\n📋 PASS 1: Exact Specific Matches (from TimeGrip Planned Function)');

    const specificStaff = timegripData.staffByFunction?.SPECIFIC || [];
    console.log(`   Processing ${specificStaff.length} SPECIFIC staff from TimeGrip...`);

    for (const timegripStaff of specificStaff) {
      if (assignedStaff.has(timegripStaff.name)) continue;

      const specificUnit = getSpecificUnitFromFunction(timegripStaff.plannedFunction);

      if (!specificUnit) {
        console.log(`  ⚠️  ${timegripStaff.name}: Could not extract unit from "${timegripStaff.plannedFunction}"`);
        continue;
      }

      const plannedFunctionLower = (timegripStaff.plannedFunction || '').toLowerCase();
      const isOperator = plannedFunctionLower.includes('operator') || plannedFunctionLower.includes(' op');
      const isAttendant = plannedFunctionLower.includes('attendant') || plannedFunctionLower.includes('att ') || plannedFunctionLower.includes(' att');

      let requirement = staffingRequirements.find(reqItem => {
        const unitMatches = reqItem.unitName.toLowerCase() === specificUnit.toLowerCase();
        if (!unitMatches) return false;

        const reqPositionLower = reqItem.position.toLowerCase();
        const reqIsOperator = reqPositionLower.includes('operator');
        const reqIsAttendant = reqPositionLower.includes('attendant');

        if (isOperator && !reqIsOperator) return false;
        if (isAttendant && !reqIsAttendant) return false;

        return true;
      });

      if (!requirement || (filledPositions.get(requirement.position) || 0) >= requirement.staffNeeded) {
        if (specificUnit.toLowerCase().includes('car park')) {
          const carParkPositions = staffingRequirements.filter(reqItem => reqItem.unitName.includes('Car Parks') && !reqItem.unitName.includes('Break Cover'));

          if (carParkPositions.length > 0) {
            const sorted = carParkPositions.sort((a, b) => {
              const fillA = filledPositions.get(a.position) || 0;
              const fillB = filledPositions.get(b.position) || 0;
              return fillA - fillB;
            });
            requirement = sorted[0];
            console.log(`  ↪️  ${timegripStaff.name}: Car Parks reassigned to ${requirement.unitName}`);
          }
        }
      }

      if (!requirement) {
        console.log(`  ⚠️  ${timegripStaff.name}: Could not assign to category`);
        continue;
      }

      assignments.push({
        unit: requirement.unitName,
        position: requirement.position,
        positionType: 'Specific (V13)',
        staff: timegripStaff.name,
        zone,
        dayCode,
        trainingMatch: `Specific: ${timegripStaff.plannedFunction}`,
        startTime: timegripStaff.startTime,
        endTime: timegripStaff.endTime,
        breakMinutes: timegripStaff.scheduledBreakMinutes || 0,
        isBreak: false,
        category: getCategoryFromUnit(requirement.unitName)
      });

      assignedStaff.add(timegripStaff.name);
      filledPositions.set(requirement.position, (filledPositions.get(requirement.position) || 0) + 1);

      console.log(`  ✅ ${timegripStaff.name} → ${requirement.unitName} (${requirement.position}) ${timegripStaff.startTime}-${timegripStaff.endTime}`);
      assigned++;
    }

    console.log('\n📋 PASS 2: Smart Retail/Admissions & Break Cover Assignment');

    const unassignedRidesStaff = (timegripData.staffByFunction?.SPECIFIC || []).filter(s => !assignedStaff.has(s.name) && s.plannedFunction?.startsWith('Rides -'));

    for (const staff of unassignedRidesStaff) {
      const ridesBreakCoverReq = staffingRequirements.find(r => r.unitName === 'Rides Break Cover' && r.position.includes('Attendant'));
      if (!ridesBreakCoverReq) break;
      const filled = assignments.filter(a => a.unit === 'Rides Break Cover' && a.position.includes('Attendant') && !a.isBreak).length;
      if (filled >= ridesBreakCoverReq.staffNeeded) break;

      assignments.push({
        unit: 'Rides Break Cover',
        position: ridesBreakCoverReq.position,
        positionType: 'Break Cover (Redirected)',
        staff: staff.name,
        zone,
        dayCode,
        trainingMatch: `Redirected: ${staff.plannedFunction}`,
        startTime: staff.startTime,
        endTime: staff.endTime,
        breakMinutes: staff.scheduledBreakMinutes || 0,
        isBreak: false
      });
      assignedStaff.add(staff.name);
      filledPositions.set(ridesBreakCoverReq.position, (filledPositions.get(ridesBreakCoverReq.position) || 0) + 1);
      assigned++;
      console.log(`  ✅ ${staff.name} → Rides Break Cover (redirected from ${staff.plannedFunction})`);
    }

    const deferredRetailAdmissions = (timegripData.staffByFunction?.SPECIFIC || []).filter(s =>
      (s.plannedFunction?.includes('Retail') || s.plannedFunction?.includes('Admissions')) &&
      s.plannedFunction?.includes('Host') &&
      !assignedStaff.has(s.name)
    );

    console.log(`   Found ${deferredRetailAdmissions.length} deferred retail/admissions staff`);

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

    const aztecaPrePassResult = applyAztecaPrePass({
      staffingRequirements,
      staffByType,
      assignedStaff,
      assignments,
      filledPositions,
      dayCode,
      zone,
      getCategoryFromUnit,
      hasSkillForUnit,
      skillsData
    });
    assigned += aztecaPrePassResult.assignedCount;

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

    analyzeBreakCoverageSmart({
      assignments,
      breakCoverStaffAssignments: assignments.filter(a => a.isBreakCover),
      timeToMinutes,
      minutesToTime,
      zone,
      dayCode
    });

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

    console.log('\n🔄 Step 6: Reassigning entrance overflow staff to retail after breaks...');
    const reassignedAssignments = reassignEntranceStaffAfternoon({
      assignments: splitAndCoveredAssignments,
      staffingRequirements,
      skillsData,
      dayCode,
      timeToMinutes,
      hasSkillForUnit
    });

    const finalAssignmentsBeforeStats = reassignedAssignments;

    assignments.length = 0;
    assignments.push(...finalAssignmentsBeforeStats);
    assigned = finalAssignmentsBeforeStats.filter(a => a.staff !== 'UNFILLED').length;

    console.log('\n📋 Deploying Zonal Leads to fill gaps...');
    const zonalLeadStaff = timegripData.staffByFunction?.MANAGEMENT || [];
    const unfilledPositions = [];

    for (const reqItem of staffingRequirements) {
      const currentFill = assignments.filter(a =>
        a.unit === reqItem.unitName &&
        a.position === reqItem.position &&
        a.staff !== 'UNFILLED'
      ).length;

      if (currentFill < reqItem.staffNeeded) {
        unfilledPositions.push({
          unit: reqItem.unitName,
          position: reqItem.position,
          needed: reqItem.staffNeeded - currentFill
        });
      }
    }

    if (unfilledPositions.length > 0 && zonalLeadStaff.length > 0) {
      console.log(`   Found ${unfilledPositions.length} unfilled positions`);

      for (const unfilled of unfilledPositions) {
        for (let i = 0; i < unfilled.needed; i++) {
          const availableLead = zonalLeadStaff.find(zl => !assignments.some(a => a.staff === zl.name && a.unit !== 'Zonal Leads'));

          if (availableLead) {
            assignments.push({
              unit: unfilled.unit,
              position: unfilled.position,
              positionType: 'Zonal Lead (Deployed)',
              staff: availableLead.name,
              zone,
              dayCode,
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

    const totalNeeded = staffingRequirements.reduce((sum, reqItem) => sum + reqItem.staffNeeded, 0);
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

    assignments.sort((a, b) => a.staff.localeCompare(b.staff));

    const uniqueStaffNames = new Set();
    const sortedStaffList = [];
    const allWorkingStaff = timegripData.workingStaff || [];

    for (const assignment of assignments) {
      if (!uniqueStaffNames.has(assignment.staff) && assignment.staff !== 'UNFILLED') {
        uniqueStaffNames.add(assignment.staff);
        sortedStaffList.push({ name: assignment.staff });
      }
    }

    for (const timegripStaff of allWorkingStaff) {
      if (!uniqueStaffNames.has(timegripStaff.name)) {
        uniqueStaffNames.add(timegripStaff.name);

        let reason = 'No suitable positions available';
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
          const startTime = timegripStaff.startTime;
          const endTime = timegripStaff.endTime;
          const hoursWorking = (parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) -
                               (parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1]));
          if (hoursWorking < 300) {
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

    console.log('🎙️ Detecting briefing attendees...');
    const briefingTimesByStaff = detectBriefingStaff(assignments);
    const briefing0830 = Array.from(briefingTimesByStaff.values()).filter((time) => time === '08:30').length;
    const briefing915 = Array.from(briefingTimesByStaff.values()).filter((time) => time === '09:15').length;
    const briefing1100 = Array.from(briefingTimesByStaff.values()).filter((time) => time === '11:00').length;
    console.log(`   ✅ ${briefingTimesByStaff.size} total briefing attendees (08:30=${briefing0830}, 09:15=${briefing915}, 11:00=${briefing1100})\n`);

    assignments.forEach(assignment => {
      const briefingTime = briefingTimesByStaff.get(assignment.staff);
      if (briefingTime && assignment.startTime === briefingTime) {
        assignment.hasBriefing = true;
        assignment.briefingTime = briefingTime;
      }
    });

    const parkWideUnits = getAllParkUnits(ZONE_FILES);

    const scheduleData = {
      teamName,
      zone,
      dayCode,
      dayCodeName: dayCodeInfo ? dayCodeInfo.label : `Day Code ${dayCode}`,
      dayCodeDescription: dayCodeInfo ? dayCodeInfo.label.split(' - ')[1] || '' : '',
      date,
      assignments,
      staffList: sortedStaffList,
      alerts: timegripData.alerts || null,
      statistics: {
        filledCount: staffedRequiredSlots,
        totalPositions: totalNeeded,
        fillRate: totalNeeded > 0 ? Math.round((staffedRequiredSlots / totalNeeded) * 100) : 0
      },
      parkWideUnits,
      explorerColor: '#DA9694',
      explorerUnits: ['Explorer Entrance'],
      seniorHostStaff: skillsData.seniorHosts || []
    };

    const excelBuffer = await generateExcelPlanner(scheduleData);
    const base64 = excelBuffer.toString('base64');

    const normalizedTeamName = String(teamName || '').replace(/^team\s+/i, '').trim();
    const teamSegment = sanitizeFileNameSegment(normalizedTeamName);
    const dayCodeSegment = sanitizeFileNameSegment(dayCode);
    const dateSegment = formatDateForFileName(date);
    const filename = `${teamSegment}-Code-${dayCodeSegment}-${dateSegment}.xlsx`;
    console.log(`Generated Excel planner: ${filename} (${staffedRequiredSlots}/${totalNeeded} required positions filled)`);

  res.json({
    success: true,
    assigned: staffedRequiredSlots,
    total: totalNeeded,
    fillRate: totalNeeded > 0 ? Math.round((staffedRequiredSlots / totalNeeded) * 100) : 0,
    assignments,
    alerts: timegripData.alerts || null,
    excelFile: base64,
    filename
  });
}));

module.exports = router;
