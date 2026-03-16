// ✅ SKILLS MATRIX PARSER - FIXED V8.1
// Uses direct cell references + accepts both "1" and "Refresh" training

const XLSX = require('xlsx');
const { toTrimmedString, toLowerTrimmed } = require('./parserUtils');

const NON_STAFF_KEYWORDS = [
  'Senior Park Ops Manager',
  'Zonal Managers',
  'Zonal Leads',
  'Senior Hosts',
  'None',
  'Total',
  'Name:',
  'Type',
  'section'
];

function getWorksheetCellValue(worksheet, row, col) {
  const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = worksheet[cellRef];
  return cell ? (cell.v || '') : '';
}

function extractZonalLeads(worksheet) {
  const zonalLeads = [];

  console.log('🔑 Extracting Zonal Leads from rows 16-20, column E...');
  for (let row = 16; row <= 20; row++) {
    const name = toTrimmedString(getWorksheetCellValue(worksheet, row, 5));

    if (name && name.length > 2 && !name.includes('Total') && !name.includes('Zonal') && !name.includes('=')) {
      zonalLeads.push(name);
      console.log(`   ✅ Zonal Lead: ${name}`);
    }
  }

  console.log(`\n✅ Found ${zonalLeads.length} Zonal Leads\n`);
  return zonalLeads;
}

function findSeniorHostLabelRow(worksheet) {
  for (let row = 15; row <= 35; row++) {
    const cellValue = toLowerTrimmed(getWorksheetCellValue(worksheet, row, 5));
    if (cellValue.includes('senior host')) {
      console.log(`   Found "Senior Hosts" label at row ${row}`);
      return row;
    }
  }
  return null;
}

function extractSeniorHosts(worksheet) {
  const seniorHosts = [];

  console.log('🔑 Searching for Senior Hosts section...');
  const seniorHostLabelRow = findSeniorHostLabelRow(worksheet);

  if (!seniorHostLabelRow) {
    console.log(`\n✅ Found ${seniorHosts.length} Senior Hosts\n`);
    return seniorHosts;
  }

  for (let row = seniorHostLabelRow + 1; row <= seniorHostLabelRow + 15; row++) {
    const name = toTrimmedString(getWorksheetCellValue(worksheet, row, 5));
    const lowerName = name.toLowerCase();

    // Stop if we hit another section header
    if (lowerName.includes('host') || lowerName.includes('operator') ||
        lowerName.includes('total') || lowerName.includes('zonal') ||
        lowerName.includes('senior') || lowerName.includes('=') ||
        lowerName === 'none' || name.length < 3) {
      break;
    }

    seniorHosts.push(name);
    console.log(`   ✅ Senior Host: ${name}`);
  }

  console.log(`\n✅ Found ${seniorHosts.length} Senior Hosts\n`);
  return seniorHosts;
}

function extractSkillHeaders(worksheet) {
  const headers = [];

  for (let col = 6; col <= 41; col++) {
    const unit = toTrimmedString(getWorksheetCellValue(worksheet, 3, col));
    const position = toTrimmedString(getWorksheetCellValue(worksheet, 4, col));

    if (unit && position && !['Total skills:', 'Name:', ''].includes(unit)) {
      headers.push({ col, unit, position });
    }
  }

  console.log(`📋 Found ${headers.length} skill columns`);
  console.log(`First 3 skills: ${headers.slice(0, 3).map(h => `${h.unit}-${h.position}`).join(', ')}\n`);
  return headers;
}

function isValidStaffName(name) {
  if (!name || name === '' || name.toLowerCase() === 'none') return false;
  if (NON_STAFF_KEYWORDS.includes(name)) return false;
  if (name.length < 3 || /^\d+$/.test(name)) return false;
  return true;
}

function extractStaffSkills(worksheet, headers) {
  const staff = {};
  let staffCount = 0;
  let skippedCount = 0;

  for (let row = 8; row <= 100; row++) {
    const name = toTrimmedString(getWorksheetCellValue(worksheet, row, 5));

    if (!name || name === '' || name.toLowerCase() === 'none') continue;

    if (NON_STAFF_KEYWORDS.includes(name)) {
      skippedCount++;
      continue;
    }

    if (!isValidStaffName(name)) continue;

    const skills = [];

    for (const header of headers) {
      const cellValue = getWorksheetCellValue(worksheet, row, header.col);
      const isValidSkill = cellValue === 1 || cellValue === '1' || toLowerTrimmed(cellValue) === 'refresh';

      if (isValidSkill) {
        skills.push(`${header.unit}-${header.position}`);
      }
    }

    if (skills.length > 0) {
      staff[name] = skills;
      staffCount++;

      if (staffCount <= 10) {
        console.log(`  ✅ ${name}: ${skills.slice(0, 3).join(', ')}${skills.length > 3 ? ` +${skills.length - 3} more` : ''}`);
      }
    }
  }

  if (staffCount > 10) {
    console.log(`  ... and ${staffCount - 10} more staff`);
  }

  console.log(`\n✅ Extracted ${staffCount} staff with trained skills (1 or Refresh)`);
  console.log(`⭐️  Skipped ${skippedCount} non-staff rows\n`);

  return { staff, staffCount, skippedCount };
}

function parseSkillsMatrix(filePath, teamName = 'Team Nexus') {
  console.log('\n📊 Parsing Skills Matrix...');
  console.log(`🎯 Reading sheet: "${teamName}"`);
  
  const workbook = XLSX.readFile(filePath);
  
  if (!workbook.SheetNames.includes(teamName)) {
    console.error(`❌ ERROR: Sheet "${teamName}" not found!`);
    console.log(`Available sheets: ${workbook.SheetNames.join(', ')}`);
    return {
      staffWithGreen: [],
      zonalLeads: [],
      count: 0,
      error: `Sheet "${teamName}" not found`
    };
  }
  
  const worksheet = workbook.Sheets[teamName];
  
  console.log(`⚙️ Using direct cell references (E8:AP100)\n`);

  const zonalLeads = extractZonalLeads(worksheet);
  const seniorHosts = extractSeniorHosts(worksheet);
  const headers = extractSkillHeaders(worksheet);
  const { staff, staffCount } = extractStaffSkills(worksheet, headers);
  
  // Convert to array format
  const staffArray = Object.entries(staff).map(([name, skills]) => ({
    name,
    greenUnits: skills
  }));
  
  return {
    staffWithGreen: staffArray,
    zonalLeads: zonalLeads,  // ✅ NOW RETURNS ZONAL LEADS!
    seniorHosts: seniorHosts,  // ✅ BUG #6 FIX: NOW RETURNS SENIOR HOSTS!
    count: staffCount
  };
}

module.exports = { parseSkillsMatrix };
