const express = require('express');
const fs = require('fs');

const { parseZoneFile } = require('../parsers/zoneFileParser');
const { ZONE_FILES } = require('../config/zoneFiles');
const { filterUnitsForTeam } = require('../utils/unitHelpers');
const { getUnitsWithStatus } = require('../services/utilities/zoneUnitStatusService');
const { asyncHandler } = require('../middleware/asyncHandler');

const VERBOSE_API_LOGS = process.env.VERBOSE_API_LOGS === 'true';

const router = express.Router();

router.get('/zones', asyncHandler(async (req, res) => {
  const zones = Object.keys(ZONE_FILES).map(zone => ({
    code: zone,
    label: zone.replace(/_/g, ' ')
  }));
  res.json({ zones });
}));

router.post('/day-codes-for-zone', asyncHandler(async (req, res) => {
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
}));

router.post('/get-unit-status', asyncHandler(async (req, res) => {
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
    units,
    teamName,
    zone,
    date,
    dayCode
  });
}));

module.exports = router;
