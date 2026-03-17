// ✅ ZONE FILE PARSER - Extracts day codes and staffing requirements from zone files
// Pattern: Day Code A at col K with label in col L, staffing cols N-O; etc.
// FIXED: Now reads Column A for unit names (not Column B)

const XLSX = require('xlsx');
const { toTrimmedString, toLowerTrimmed } = require('./parserUtils');

const DAY_CODE_HEADER_ROW_INDEX = 7;
const UNIT_NAME_COLUMN_INDEX = 0;
const POSITION_COLUMN_INDEX = 1;
const DATA_START_ROW_INDEX = 11;
const MIN_DAY_CODE_TOKENS = 3;
const MAX_REASONABLE_STAFF_COUNT = 10;
const VERBOSE_ZONE_PARSING = process.env.VERBOSE_ZONE_PARSING === 'true';

function getDayCodeColumns(rowData = []) {
  const columns = [];

  for (let col = 0; col < rowData.length; col++) {
    const value = toTrimmedString(rowData[col]);
    if (/^[A-O]$/.test(value)) {
      columns.push(col);
    }
  }

  return columns;
}

function findDayCodeHeaderRowIndex(data) {
  let bestRowIndex = -1;
  let bestScore = -1;
  const maxScanRows = Math.min(data.length, 120);

  for (let row = 0; row < maxScanRows; row++) {
    const dayCodeColumns = getDayCodeColumns(data[row] || []);

    if (dayCodeColumns.length < MIN_DAY_CODE_TOKENS) {
      continue;
    }

    const gaps = [];
    for (let i = 1; i < dayCodeColumns.length; i++) {
      gaps.push(dayCodeColumns[i] - dayCodeColumns[i - 1]);
    }

    const wideGapCount = gaps.filter((gap) => gap >= 3).length;
    const score = dayCodeColumns.length + (wideGapCount * 2);

    if (score > bestScore) {
      bestScore = score;
      bestRowIndex = row;
    }
  }

  return bestRowIndex;
}

function findDataStartRowIndex(data, headerRowIndex) {
  const skipUnitNames = new Set([
    'unit name',
    'total hours',
    'pre-april cost',
    'post-april cost',
    'grade',
    'zone',
    'cost centre',
    'start',
    'end',
    'break length (min)',
    'staff #',
    'fte'
  ]);

  for (let row = Math.max(0, headerRowIndex + 1); row < data.length; row++) {
    const rowData = data[row];
    if (!rowData) continue;

    const unitName = toTrimmedString(rowData[UNIT_NAME_COLUMN_INDEX]);
    const position = toTrimmedString(rowData[POSITION_COLUMN_INDEX]);

    if (!unitName) continue;
    if (skipUnitNames.has(toLowerTrimmed(unitName))) continue;
    if (toLowerTrimmed(unitName) === 'none') continue;
    if (position && toLowerTrimmed(position) === 'staffed position') continue;

    return row;
  }

  return Math.max(headerRowIndex + 1, DATA_START_ROW_INDEX);
}

function getSchedulingWorksheet(workbook) {
  if (workbook.Sheets['Scheduling']) {
    return {
      sheetName: 'Scheduling',
      worksheet: workbook.Sheets['Scheduling']
    };
  }

  const firstSheetName = workbook.SheetNames[0];
  return {
    sheetName: firstSheetName,
    worksheet: workbook.Sheets[firstSheetName]
  };
}

function discoverDayCodeSections(headerRow) {
  const dayCodeSections = [];

  for (let col = 0; col < headerRow.length; col++) {
    const header = toTrimmedString(headerRow[col]);

    // Day codes are single uppercase letters A-O
    if (/^[A-O]$/.test(header)) {
      const label = toTrimmedString(headerRow[col + 1] || header);

      dayCodeSections.push({
        code: header,
        startCol: col,
        label,
        // Staffing columns are typically 3-4 columns after day code start
        staffingCol1: col + 3,
        staffingCol2: col + 4
      });
    }
  }

  return dayCodeSections;
}

function getSectionStaffCount(rowData, section) {
  const staffCount1 = rowData[section.staffingCol1] || 0;
  const staffCount2 = rowData[section.staffingCol2] || 0;

  if (typeof staffCount1 === 'number' && staffCount1 > 0) {
    return staffCount1;
  }

  if (typeof staffCount2 === 'number' && staffCount2 > 0) {
    return staffCount2;
  }

  return 0;
}

function extractSectionRequirements(data, section, dataStartRowIndex) {
  const requirements = [];

  for (let row = dataStartRowIndex; row < data.length; row++) {
    if (!data[row]) continue;

    const unitName = data[row][UNIT_NAME_COLUMN_INDEX];
    const position = data[row][POSITION_COLUMN_INDEX];

    // Skip empty rows or header rows
    if (!unitName || toTrimmedString(unitName) === '' || toLowerTrimmed(unitName) === 'none') {
      continue;
    }

    const totalStaff = getSectionStaffCount(data[row], section);

    if (totalStaff > 0 && totalStaff <= MAX_REASONABLE_STAFF_COUNT) {
      const unitTrim = toTrimmedString(unitName);
      const positionTrim = toTrimmedString(position);

      // Only add if we haven't seen this exact combination for this day code
      if (!requirements.find((r) => r.unitName === unitTrim && r.position === positionTrim)) {
        requirements.push({
          unitName: unitTrim,
          position: positionTrim,
          staffNeeded: totalStaff
        });

        if (VERBOSE_ZONE_PARSING) {
          console.log(`  ✅ ${unitTrim} (${positionTrim}): ${totalStaff} staff`);
        }
      }
    }
  }

  return requirements;
}

function buildDayCodeOptions(dayCodeSections) {
  return dayCodeSections.map((d) => ({
    code: d.code,
    label: `Day Code ${d.code} - ${d.label}`
  }));
}

function parseZoneFile(filePath) {
  const zoneFileName = filePath.split(/[\\/]/).pop() || filePath;
  console.log(`\n📊 Parsing zone file: ${zoneFileName}`);
  
  const workbook = XLSX.readFile(filePath);
  const { worksheet, sheetName } = getSchedulingWorksheet(workbook);
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  const discoveredHeaderRowIndex = findDayCodeHeaderRowIndex(data);
  const headerRowIndex = discoveredHeaderRowIndex >= 0 ? discoveredHeaderRowIndex : DAY_CODE_HEADER_ROW_INDEX;
  const headerRow = data[headerRowIndex] || [];
  const dayCodeSections = discoverDayCodeSections(headerRow);
  const dataStartRowIndex = findDataStartRowIndex(data, headerRowIndex);

  if (VERBOSE_ZONE_PARSING) {
    console.log(`🗂️  Using sheet: ${sheetName}`);
    console.log(`📍 Day code header row index: ${headerRowIndex}`);
    console.log(`📍 Data start row index: ${dataStartRowIndex}`);
  }
  
  if (VERBOSE_ZONE_PARSING) {
    console.log(`🔍 Found day codes: ${dayCodeSections.map(d => `${d.code} (${d.label})`).join(', ')}`);
  } else {
    console.log(`🔍 Found ${dayCodeSections.length} day codes`);
  }
  
  if (dayCodeSections.length === 0) {
    console.log(`❌ No day codes found in zone file!`);
    return {
      dayCodeOptions: [],
      staffingRequirements: {}
    };
  }
  
  // ✅ Parse staffing requirements for each day code
  const staffingRequirements = {};
  
  for (const section of dayCodeSections) {
    if (VERBOSE_ZONE_PARSING) {
      console.log(`\n📋 Parsing Day Code ${section.code} (${section.label}):`);
    }

    staffingRequirements[section.code] = extractSectionRequirements(data, section, dataStartRowIndex);
  }

  if (!VERBOSE_ZONE_PARSING) {
    const totalPositions = Object.values(staffingRequirements).reduce((sum, requirements) => sum + requirements.length, 0);
    console.log(`📋 Parsed ${totalPositions} staffing rows across ${dayCodeSections.length} day codes`);
  }
  
  return {
    dayCodeOptions: buildDayCodeOptions(dayCodeSections),
    staffingRequirements
  };
}

module.exports = { parseZoneFile };
