const XLSX = require('xlsx');

// Day code column mappings with CORRECT Staff# columns
const DAY_CODE_COLUMNS = {
  'A': { startCol: 9, endCol: 10, breakCol: 11, staffCol: 12, name: 'Lodge 4PM', desc: '<3,000 | Lodge Entrance | 4pm Close' },
  'B': { startCol: 19, endCol: 20, breakCol: 21, staffCol: 22, name: 'Lodge 5PM', desc: '<3,000 | Lodge Entrance | 5pm Close' },
  'C': { startCol: 28, endCol: 29, breakCol: 30, staffCol: 31, name: 'Lodge + 5PM', desc: 'Up to 4000 | Lodge Entrance | 5pm Close' },
  'D': { startCol: 37, endCol: 38, breakCol: 39, staffCol: 40, name: 'Lodge + Sch Exp', desc: '4,000-8,000 | Lodge Entrance | 5pm Close' },
  'E': { startCol: 46, endCol: 47, breakCol: 48, staffCol: 49, name: 'Explorer 5PM', desc: '4,000-8,000 | Explorer Entrance | 5pm Close' },
  'F': { startCol: 55, endCol: 56, breakCol: 57, staffCol: 58, name: 'Explorer 6PM', desc: '4,000-8,000 | Explorer Entrance | 6pm Close' },
  'G': { startCol: 64, endCol: 65, breakCol: 66, staffCol: 67, name: 'Explorer + 5PM', desc: '8,000-10,000 | Explorer Entrance | 5pm Close' },
  'H': { startCol: 73, endCol: 74, breakCol: 75, staffCol: 76, name: 'Explorer + 6PM', desc: '8,000-10,000 | Explorer Entrance | 6pm Close' },
  'I': { startCol: 82, endCol: 83, breakCol: 84, staffCol: 85, name: 'Explorer + 7PM', desc: '8,000-10,000 | Explorer Entrance | 7pm Close' },
  'J': { startCol: 91, endCol: 92, breakCol: 93, staffCol: 94, name: 'Zoo', desc: 'Up to 2,000 | Lodge Entrance | 3pm Close' },
  'K': { startCol: 100, endCol: 101, breakCol: 102, staffCol: 103, name: 'WT Off-Peak', desc: 'Up to 1,750 | Lodge Entrance | 3pm Close' },
  'L': { startCol: 109, endCol: 110, breakCol: 111, staffCol: 112, name: 'WT Peak', desc: 'Up to 3,500 | Lodge Entrance | 5pm Close' },
  'M': { startCol: 118, endCol: 119, breakCol: 120, staffCol: 121, name: 'WT Peak+', desc: 'Up to 3,500 | Lodge Entrance | 6:30 pm Close' },
  'N': { startCol: 127, endCol: 128, breakCol: 129, staffCol: 130, name: 'WT Post Xmas', desc: 'WT Post Xmas' }
};

// Convert fractional day to HH:MM format
function fractionalDayToTime(fractional) {
  if (!fractional || fractional <= 0) return '08:30';
  
  const totalMinutes = Math.round(fractional * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseDayCodesFromExcel(filePath) {
  try {
    console.log('\n📊 Parsing day codes from Left_Zone.xlsx (with real Staff# counts)...\n');
    
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets['Sheet1'];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null });
    
    const allDayCodes = {};
    
    // Parse each day code
    for (const [code, cols] of Object.entries(DAY_CODE_COLUMNS)) {
      console.log(`Parsing Day Code ${code} - ${cols.name}...`);
      
      const positions = [];
      
      // Parse rows 12+ (index 11+) for positions
      for (let row = 11; row < Math.min(200, data.length); row++) {
        const rowData = data[row];
        if (!rowData) continue;
        
        const rideName = rowData[0]; // Column A
        const fullPosition = rowData[1]; // Column B
        const staffCount = rowData[cols.staffCol]; // Staff # column
        const startTime = rowData[cols.startCol]; // Start time
        const endTime = rowData[cols.endCol]; // End time
        const breakMins = rowData[cols.breakCol]; // Break minutes
        
        if (!rideName || !fullPosition || typeof rideName !== 'string') continue;
        if (!staffCount || staffCount <= 0) continue;
        
        // Determine position type
        let position = 'OP';
        const posLower = fullPosition.toLowerCase();
        
        if (posLower.includes('attendant')) {
          position = 'ATT';
        } else if (posLower.includes('host')) {
          position = 'Host';
        } else if (posLower.includes('driver')) {
          position = 'Driver';
        } else if (posLower.includes('operator')) {
          position = 'OP';
        }
        
        // Convert fractional day times to HH:MM
        const startTimeStr = fractionalDayToTime(startTime);
        const endTimeStr = fractionalDayToTime(endTime);
        const breakMinutes = typeof breakMins === 'number' ? Math.round(breakMins) : 30;
        
        // Add position (create multiple copies if staffCount > 1)
        const numStaff = Math.round(staffCount);
        for (let i = 0; i < numStaff; i++) {
          positions.push({
            unit: rideName.trim(),
            position: position,
            staffCount: 1,
            startTime: startTimeStr,
            endTime: endTimeStr,
            breakMinutes: breakMinutes
          });
        }
      }
      
      allDayCodes[code] = {
        code: code,
        name: cols.name,
        description: cols.desc,
        positions: positions
      };
      
      console.log(`  ✅ ${positions.length} positions extracted (with correct staff counts)`);
    }
    
    console.log(`\n✅ All ${Object.keys(allDayCodes).length} day codes parsed successfully!\n`);
    
    return allDayCodes;
    
  } catch (error) {
    console.error('Error parsing day codes:', error);
    throw error;
  }
}

function getDayCodeRequirements(teamName, dayCode, dayCodesData) {
  if (!dayCodesData || !dayCodesData[dayCode]) {
    return null;
  }
  
  return dayCodesData[dayCode];
}

function getAllDayCodeOptions(dayCodesData) {
  if (!dayCodesData) return [];
  
  return Object.values(dayCodesData).map(dc => ({
    code: dc.code,
    name: dc.name,
    description: dc.description
  }));
}

function getDayCodeOptions(teamName, dayCodesData) {
  return getAllDayCodeOptions(dayCodesData);
}

module.exports = {
  parseDayCodesFromExcel,
  getDayCodeRequirements,
  getAllDayCodeOptions,
  getDayCodeOptions
};
