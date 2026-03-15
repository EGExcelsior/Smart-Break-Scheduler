// ✅ SKILLS MATRIX PARSER - FIXED V8.1
// Uses direct cell references + accepts both "1" and "Refresh" training

const XLSX = require('xlsx');

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
  const staff = {};
  
  console.log(`⚙️ Using direct cell references (E8:AP100)\n`);
  
  // Helper function to get cell value
  function getCellValue(row, col) {
    const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
    const cell = worksheet[cellRef];
    return cell ? (cell.v || '') : '';
  }
  
  // ✅ V8.2: EXTRACT ZONAL LEADS (Rows 16-20, Column E = index 5)
  const zonalLeads = [];
  console.log(`🔑 Extracting Zonal Leads from rows 16-20, column E...`);
  for (let row = 16; row <= 20; row++) {
    const name = String(getCellValue(row, 5)).trim();  // Column E
    
    if (name && name.length > 2 && !name.includes('Total') && !name.includes('Zonal') && !name.includes('=')) {
      zonalLeads.push(name);
      console.log(`   ✅ Zonal Lead: ${name}`);
    }
  }
  console.log(`\n✅ Found ${zonalLeads.length} Zonal Leads\n`);
  
  // ✅ BUG #6 FIX: EXTRACT SENIOR HOSTS (Dynamic search for "Senior Hosts" label)
  const seniorHosts = [];
  console.log(`🔑 Searching for Senior Hosts section...`);
  
  // Find the "Senior Hosts" label row
  let seniorHostLabelRow = null;
  for (let row = 15; row <= 35; row++) {
    const cellValue = String(getCellValue(row, 5)).trim().toLowerCase();
    if (cellValue.includes('senior host')) {
      seniorHostLabelRow = row;
      console.log(`   Found "Senior Hosts" label at row ${row}`);
      break;
    }
  }
  
  if (seniorHostLabelRow) {
    // Extract names from rows below the label
    for (let row = seniorHostLabelRow + 1; row <= seniorHostLabelRow + 15; row++) {
      const name = String(getCellValue(row, 5)).trim();
      
      // Stop if we hit another section header
      const lowerName = name.toLowerCase();
      if (lowerName.includes('host') || lowerName.includes('operator') || 
          lowerName.includes('total') || lowerName.includes('zonal') || 
          lowerName.includes('senior') || lowerName.includes('=') || 
          lowerName === 'none' || name.length < 3) {
        break;
      }
      
      seniorHosts.push(name);
      console.log(`   ✅ Senior Host: ${name}`);
    }
  }
  console.log(`\n✅ Found ${seniorHosts.length} Senior Hosts\n`);
  
  // Build skill column headers (Row 3 = units, Row 4 = positions)
  const headers = [];
  for (let col = 6; col <= 41; col++) {  // F to AO (columns 6-41)
    const unit = String(getCellValue(3, col)).trim();
    const position = String(getCellValue(4, col)).trim();
    
    if (unit && position && !['Total skills:', 'Name:', ''].includes(unit)) {
      headers.push({ col, unit, position });
    }
  }
  
  console.log(`📋 Found ${headers.length} skill columns`);
  console.log(`First 3 skills: ${headers.slice(0, 3).map(h => `${h.unit}-${h.position}`).join(', ')}\n`);
  
  // Non-staff keywords (exact match only)
  const nonStaffKeywords = [
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
  
  let staffCount = 0;
  let skippedCount = 0;
  
  // Parse staff rows (Row 8 onwards)
  for (let row = 8; row <= 100; row++) {
    const name = String(getCellValue(row, 5)).trim();  // Column E = 5
    
    // Skip empty or "None"
    if (!name || name === '' || name.toLowerCase() === 'none') continue;
    
    // Skip non-staff keywords (exact match)
    if (nonStaffKeywords.includes(name)) {
      skippedCount++;
      continue;
    }
    
    // Skip if too short or purely numeric
    if (name.length < 3 || /^\d+$/.test(name)) continue;
    
    const skills = [];
    
    // ✅ V8.1: Check each skill column for "1" (Green) or "Refresh" (Refresh training)
    for (const header of headers) {
      const cellValue = getCellValue(row, header.col);
      
      // ✅ Accept BOTH "1" (fully trained) AND "Refresh" (refresh training)
      const isValidSkill = cellValue === 1 || cellValue === '1' || 
                          String(cellValue).toLowerCase() === 'refresh';
      
      if (isValidSkill) {
        const skillKey = `${header.unit}-${header.position}`;
        skills.push(skillKey);
      }
    }
    
    // Only add staff if they have at least one trained skill
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
