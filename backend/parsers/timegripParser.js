/**
 * Enhanced TimeGrip Parser V6 - FINAL VERSION
 * Parses E_Daily_Export-2 CSV and structures data by staffCategory
 * Returns: staffByFunction.SPECIFIC, BREAK_COVER, GENERIC, MANAGEMENT
 */

const fs = require('fs').promises;

function createEmptyAlerts() {
  return {
    absenceWithShift: [],
    absenceIncludedByOverride: [],
    absentStaffSkipped: []
  };
}

function normalizeNameKey(value) {
  return (value || '').toString().trim().toLowerCase();
}

async function parseTimegripCsv(filePath, targetTeam, targetDate = null, options = {}) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const includeAbsentStaffNames = new Set((options.includeAbsentStaffNames || []).map(normalizeNameKey));
  
  // Convert target date
  let searchDate = targetDate;
  if (targetDate && targetDate.includes('-')) {
    const parts = targetDate.split('-');
    if (parts[0].length === 4) {
      searchDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  
  console.log(`🔍 Looking for staff working on: ${searchDate || 'any date'}`);
  
  // TRY TABULAR FORMAT
  const tabularResult = parseTabularCsv(lines, searchDate, { includeAbsentStaffNames });
  
  if (tabularResult.workingStaff.length > 0) {
    console.log(`\n✅ TABULAR format SUCCESS! Found ${tabularResult.workingStaff.length} staff\n`);
    return tabularResult;
  }
  
  console.log('⚠️  Tabular format not detected, trying WorkPlan format...');
  const workplanResult = parseWorkplanFormat(lines, searchDate);
  
  console.log(`\n✅ Found ${workplanResult.workingStaff.length} staff with schedules from TimeGrip\n`);
  return workplanResult;
}

function parseTabularCsv(lines, searchDate, options = {}) {
  const includeAbsentStaffNames = options.includeAbsentStaffNames || new Set();
  // Find header row
  let headerIndex = -1;
  let headers = [];
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].includes('User ID') && lines[i].includes('Name')) {
      headerIndex = i;
      headers = lines[i].split(',').map(h => h.trim());
      break;
    }
  }
  
  if (headerIndex === -1) {
    return { workingStaff: [], totalStaff: 0, staffByFunction: {} };
  }
  
  // Find column indices
  const nameIndex = headers.findIndex(h => h === 'Name');
  const dateIndex = headers.findIndex(h => h === 'Start Date');
  const startTimeIndex = headers.findIndex(h => h === 'Start Time');
  const endTimeIndex = headers.findIndex(h => h === 'End Time');
  const breakLengthIndex = headers.findIndex(h => h === 'Break Length');
  const plannedFunctionIndex = headers.findIndex(h => h === 'Planned Function');
  const absenceCodeIndex = headers.findIndex(h => h === 'Absence Code');
  const absenceReasonIndex = headers.findIndex(h => h === 'Absence Reason');
  
  if (nameIndex === -1 || startTimeIndex === -1 || endTimeIndex === -1) {
    return { workingStaff: [], totalStaff: 0, staffByFunction: {} };
  }
  
  // Initialize result structures
  const workingStaff = [];
  const alerts = createEmptyAlerts();
  const staffByFunction = {
    SPECIFIC: [],
    BREAK_COVER: [],
    GENERIC: [],
    MANAGEMENT: []
  };
  
  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const cols = line.split(',').map(c => c.trim());
    
    const name = cols[nameIndex];
    const date = cols[dateIndex];
    const startTime = cols[startTimeIndex];
    const endTime = cols[endTimeIndex];
    const plannedFunction = plannedFunctionIndex >= 0 ? cols[plannedFunctionIndex] : '';
    const absenceCode = absenceCodeIndex >= 0 ? cols[absenceCodeIndex] : '0';
    const absenceReason = absenceReasonIndex >= 0 ? cols[absenceReasonIndex] : '';
    
    // Check date match
    const dateMatches = !searchDate || date === searchDate || date.includes(searchDate);
    if (!dateMatches) continue;
    
    // ✅ NEW: Filter out staff with absences (Holiday, Sick, etc.)
    // Absence codes: 0 = Working, 32 = Holiday, others = various absences
    if (absenceCode && absenceCode !== '0' && absenceCode.trim() !== '') {
      const alertRecord = {
        name,
        date,
        startTime,
        endTime,
        plannedFunction: plannedFunction ? plannedFunction.trim() : '',
        absenceCode: absenceCode.trim(),
        absenceReason: absenceReason ? absenceReason.trim() : '',
        includedByOverride: includeAbsentStaffNames.has(normalizeNameKey(name))
      };

      if (alertRecord.startTime && alertRecord.endTime && alertRecord.plannedFunction) {
        alerts.absenceWithShift.push(alertRecord);
      }

      if (alertRecord.includedByOverride) {
        alerts.absenceIncludedByOverride.push(alertRecord);
        console.log(`  ⚠️  ${name}: ABSENT (Code ${absenceCode}${absenceReason ? ` - ${absenceReason}` : ''}) - INCLUDED BY OVERRIDE`);
      } else {
        alerts.absentStaffSkipped.push(alertRecord);
        console.log(`  ⚠️  ${name}: ABSENT (Code ${absenceCode}${absenceReason ? ` - ${absenceReason}` : ''}) - SKIPPED`);
        continue;
      }
    }
    
    // Parse break
    let scheduledBreak = null;
    if (breakLengthIndex >= 0 && cols[breakLengthIndex]) {
      const breakStr = cols[breakLengthIndex].trim();
      const breakMatch = breakStr.match(/(\d+):(\d+)/);
      if (breakMatch) {
        const hours = parseInt(breakMatch[1], 10);
        const mins = parseInt(breakMatch[2], 10);
        scheduledBreak = hours * 60 + mins;
      }
    }
    
    // Determine staff category
    let staffCategory = 'SPECIFIC';
    if (plannedFunction.includes('Zonal Lead')) {
      staffCategory = 'MANAGEMENT';
    } else if (plannedFunction.includes('Break Cover') || plannedFunction.includes(' T1')) {
      // "Break Cover" = Retail/GHI break cover
      // "T1" = Rides Tier 1 break cover (e.g., "Rides - Operator T1")
      staffCategory = 'BREAK_COVER';
    } else if (plannedFunction.match(/^(Retail|Admissions|GHI|Car Park)/i) && !plannedFunction.includes('-')) {
      staffCategory = 'GENERIC';
    }
    
    const staffRecord = {
      name: name,
      startTime: startTime,
      endTime: endTime,
      scheduledBreakMinutes: scheduledBreak,
      team: '',
      plannedFunction: plannedFunction.trim(),  // ✅ FIX: Use plannedFunction not scheduledFunction
      staffCategory: staffCategory
    };
    
    workingStaff.push(staffRecord);
    staffByFunction[staffCategory].push(staffRecord);
    
    console.log(`  ✅ ${name}: ${startTime}-${endTime} → ${staffCategory}: ${plannedFunction}`);
  }

  if (alerts.absenceWithShift.length > 0) {
    console.log(`\n🚨 TimeGrip alert: ${alerts.absenceWithShift.length} staff have an absence code but also a scheduled shift:`);
    alerts.absenceWithShift.forEach((item) => {
      console.log(
        `   - ${item.name} (${item.startTime}-${item.endTime}, ${item.plannedFunction}, code ${item.absenceCode}${item.absenceReason ? ` - ${item.absenceReason}` : ''}${item.includedByOverride ? ', included' : ', skipped'})`
      );
    });
  }
  
  return {
    workingStaff,
    totalStaff: workingStaff.length,
    staffByFunction,  // ✅ CRUCIAL: Structured data for server.js
    alerts: {
      ...alerts,
      absenceWithShiftCount: alerts.absenceWithShift.length,
      absenceIncludedByOverrideCount: alerts.absenceIncludedByOverride.length,
      absentStaffSkippedCount: alerts.absentStaffSkipped.length
    }
  };
}

function parseWorkplanFormat(lines, searchDate) {
  const workingStaff = [];
  const alerts = createEmptyAlerts();
  const staffByFunction = {
    SPECIFIC: [],
    BREAK_COVER: [],
    GENERIC: [],
    MANAGEMENT: []
  };
  
  let currentStaff = null;
  let inScheduleSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    const staffMatch = line.match(/Workplan.*for\s+([A-Za-z\s]+)\s+(Rides and Attractions|Retail and Admissions|Zonal Managers)/i);
    if (staffMatch) {
      currentStaff = staffMatch[1].trim();
      inScheduleSection = false;
      continue;
    }
    
    if (line.includes('Day;Date') && line.includes('Starting time')) {
      inScheduleSection = true;
      continue;
    }
    
    if (currentStaff && inScheduleSection) {
      const hasTargetDate = !searchDate || line.includes(searchDate);
      
      if (hasTargetDate) {
        const parts = line.split(';');
        
        for (let partIndex = 0; partIndex < parts.length; partIndex++) {
          const part = parts[partIndex];
          const timeMatch = part.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
          if (timeMatch) {
            const startTime = timeMatch[1];
            const endTime = timeMatch[2];
            
            let scheduledBreak = null;
            for (let j = partIndex + 1; j < Math.min(partIndex + 6, parts.length); j++) {
              const potentialBreak = parts[j].trim();
              if (potentialBreak.match(/^\d{2}:\d{2}$/) && !potentialBreak.includes('-')) {
                const [hours, mins] = potentialBreak.split(':').map(Number);
                const breakMins = hours * 60 + mins;
                if (breakMins >= 15 && breakMins <= 90) {
                  scheduledBreak = breakMins;
                  break;
                }
              }
            }
            
            const staffRecord = {
              name: currentStaff,
              startTime: startTime,
              endTime: endTime,
              scheduledBreakMinutes: scheduledBreak,
              team: '',
              plannedFunction: ''  // ✅ FIX: Use plannedFunction field
            };
            
            workingStaff.push(staffRecord);
            // Default to SPECIFIC for WorkPlan format
            staffByFunction.SPECIFIC.push(staffRecord);
            
            console.log(`  ✅ ${currentStaff}: ${startTime}-${endTime}` + 
                       (scheduledBreak ? ` (${scheduledBreak}min break)` : ''));
            
            inScheduleSection = false;
            currentStaff = null;
            break;
          }
        }
      }
    }
  }
  
  return {
    workingStaff,
    totalStaff: workingStaff.length,
    staffByFunction,  // ✅ CRUCIAL: Structured data for server.js
    alerts: {
      ...alerts,
      absenceWithShiftCount: 0,
      absenceIncludedByOverrideCount: 0,
      absentStaffSkippedCount: 0
    }
  };
}

module.exports = { parseTimegripCsv };
