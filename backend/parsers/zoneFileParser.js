// ✅ ZONE FILE PARSER - Extracts day codes and staffing requirements from zone files
// Pattern: Day Code A at col K with label in col L, staffing cols N-O; etc.
// FIXED: Now reads Column A for unit names (not Column B)

const XLSX = require('xlsx');
const { toTrimmedString, toLowerTrimmed } = require('./parserUtils');

const DAY_CODE_HEADER_ROW_INDEX = 7;
const UNIT_NAME_COLUMN_INDEX = 0;
const POSITION_COLUMN_INDEX = 1;
const DATA_START_ROW_INDEX = 11;
const MAX_REASONABLE_STAFF_COUNT = 10;
const VERBOSE_ZONE_PARSING = process.env.VERBOSE_ZONE_PARSING === 'true';

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

function extractSectionRequirements(data, section) {
  const requirements = [];

  for (let row = DATA_START_ROW_INDEX; row < data.length; row++) {
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
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Row 8 (index 7) has day code headers: A, B, C, D, E, etc.
  const headerRow = data[DAY_CODE_HEADER_ROW_INDEX] || [];
  const dayCodeSections = discoverDayCodeSections(headerRow);
  
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

    staffingRequirements[section.code] = extractSectionRequirements(data, section);
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
