const fs = require('fs');
const XLSX = require('xlsx');

const { UNIT_CATEGORIES } = require('../../config/constants');
const { getCategoryFromUnit } = require('../../utils/unitHelpers');

const VERBOSE_API_LOGS = process.env.VERBOSE_API_LOGS === 'true';

function getClosedDaysStatus(zoneFilePath, date, dayCode) {
  try {
    if (VERBOSE_API_LOGS) {
      console.log(`📖 Reading Closed Days from: ${zoneFilePath}`);
    }

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

    if (VERBOSE_API_LOGS) {
      console.log(`📄 Closed Days sheet has ${data.length} rows`);
    }

    const headers = data[2];

    if (!headers) {
      console.error('❌ Headers row not found in Closed Days sheet');
      return {};
    }

    let targetRow = null;
    for (let i = 5; i < data.length; i++) {
      const row = data[i];
      if (!row) continue;

      const rowDate = row[3];

      if (rowDate) {
        let rowDateStr = '';

        if (typeof rowDate === 'string') {
          const match = rowDate.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{2})/);
          if (match) {
            const day = match[1].padStart(2, '0');
            const month = match[2].padStart(2, '0');
            const year = '20' + match[3];
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
          if (VERBOSE_API_LOGS) {
            console.log(`✅ Found matching date row: ${date} (matched: ${rowDateStr})`);
          }
          break;
        }
      }
    }

    if (!targetRow) {
      console.log(`⚠️  No matching date found in Closed Days for ${date}`);
      return {};
    }

    const statusMap = {};
    for (let i = 7; i < headers.length; i++) {
      const unitName = headers[i];
      const status = targetRow[i];
      if (unitName && unitName !== '' && unitName !== '0') {
        statusMap[unitName] = status === 'Open';
      }
    }

    if (VERBOSE_API_LOGS) {
      console.log(`📊 Closed Days status loaded: ${Object.keys(statusMap).length} units`);
    }
    return statusMap;
  } catch (error) {
    console.error('❌ Error parsing Closed Days sheet:', error);
    return {};
  }
}

function getUnitsWithStatus(zoneFilePath, date, dayCode) {
  const closedDaysStatus = getClosedDaysStatus(zoneFilePath, date, dayCode);

  const allUnits = Object.keys(closedDaysStatus);

  const result = {
    'Rides': [],
    'Admissions': [],
    'Retail': [],
    'Car Parks': [],
    'GHI': [],
    'Break Cover': []
  };

  for (const unitName of allUnits) {
    const category = getCategoryFromUnit(unitName);

    result[category].push({
      name: unitName,
      isOpen: closedDaysStatus[unitName] !== false,
      originalOpen: closedDaysStatus[unitName] !== false
    });
  }

  for (const category of Object.keys(result)) {
    if (result[category].length === 0) {
      delete result[category];
    } else {
      result[category].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return result;
}

function getAllParkUnits(zoneFiles = {}) {
  console.log('\n🌐 Loading park-wide unit status...');

  const allUnits = {
    rides: new Set(),
    retail: new Set(),
    admissions: new Set()
  };

  for (const [zoneName, zonePath] of Object.entries(zoneFiles)) {
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

module.exports = {
  getClosedDaysStatus,
  getUnitsWithStatus,
  getAllParkUnits
};