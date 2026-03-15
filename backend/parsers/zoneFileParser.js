// ✅ ZONE FILE PARSER - Extracts day codes and staffing requirements from zone files
// Pattern: Day Code A at col K with label in col L, staffing cols N-O; etc.
// FIXED: Now reads Column A for unit names (not Column B)

const XLSX = require('xlsx');

function parseZoneFile(filePath) {
  console.log(`\n📊 Parsing zone file for day codes and staffing requirements...`);
  
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
  
  // Row 8 (index 7) has day code headers: A, B, C, D, E, etc.
  const headerRow = data[7] || [];
  
  // Find day code column positions (A-O)
  const dayCodeSections = [];
  
  for (let col = 0; col < headerRow.length; col++) {
    const header = String(headerRow[col]).trim();
    
    // Day codes are single uppercase letters A-O
    if (/^[A-O]$/.test(header)) {
      // Get the label from the next column (e.g., "Lodge 4PM")
      const label = String(headerRow[col + 1] || header).trim();
      
      dayCodeSections.push({
        code: header,
        startCol: col,
        label: label, // ✅ NEW: Extract label
        // Staffing columns are typically 3-4 columns after day code start
        staffingCol1: col + 3, // First staff count column
        staffingCol2: col + 4  // Second staff count column
      });
    }
  }
  
  console.log(`🔍 Found day codes: ${dayCodeSections.map(d => `${d.code} (${d.label})`).join(', ')}`);
  
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
    console.log(`\n📋 Parsing Day Code ${section.code} (${section.label}):`);
    
    const requirements = [];
    
    // Scan rows starting from row 12 (index 11) - first staff position
    for (let row = 11; row < data.length; row++) {
      if (!data[row]) continue;
      
      // ✅ FIXED: Read Column A (index 0) for unit name, Column B (index 1) for position
      const unitName = data[row][0]; // Column A - Actual unit name (Room on the Broom, Adventure Tree, etc.)
      const position = data[row][1]; // Column B - Staffed position (Rider - ROTB Attendant, etc.)
      
      // Skip empty rows or header rows
      if (!unitName || String(unitName).trim() === '' || String(unitName).toLowerCase() === 'none') {
        continue;
      }
      
      // Get staffing count from the day code section
      const staffCount1 = data[row][section.staffingCol1] || 0;
      const staffCount2 = data[row][section.staffingCol2] || 0;
      
      // Use first non-zero count, or sum them if both exist
      let totalStaff = 0;
      if (typeof staffCount1 === 'number' && staffCount1 > 0) {
        totalStaff = staffCount1;
      } else if (typeof staffCount2 === 'number' && staffCount2 > 0) {
        totalStaff = staffCount2;
      }
      
      if (totalStaff > 0 && totalStaff <= 10) { // Sanity check
        const unitTrim = String(unitName).trim();
        const positionTrim = String(position).trim();
        
        // Only add if we haven't seen this exact combination for this day code
        if (!requirements.find(r => r.unitName === unitTrim && r.position === positionTrim)) {
          requirements.push({
            unitName: unitTrim,
            position: positionTrim,
            staffNeeded: totalStaff
          });
          
          console.log(`  ✅ ${unitTrim} (${positionTrim}): ${totalStaff} staff`);
        }
      }
    }
    
    staffingRequirements[section.code] = requirements;
  }
  
  return {
    dayCodeOptions: dayCodeSections.map(d => ({
      code: d.code,
      label: `Day Code ${d.code} - ${d.label}` // ✅ NEW: Include label
    })),
    staffingRequirements
  };
}

module.exports = { parseZoneFile };
