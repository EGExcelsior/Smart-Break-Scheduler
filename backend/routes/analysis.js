const express = require('express');
const fs = require('fs');

const { parseSkillsMatrix } = require('../parsers/skillsMatrixParser');
const { parseTimegripCsv } = require('../parsers/timegripParser');
const { parseZoneFile } = require('../parsers/zoneFileParser');
const { ZONE_FILES } = require('../config/zoneFiles');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../middleware/asyncHandler');

const VERBOSE_API_LOGS = process.env.VERBOSE_API_LOGS === 'true';

const router = express.Router();

router.post('/parse-and-analyze', upload.fields([
  { name: 'skillsMatrix', maxCount: 1 },
  { name: 'timegripCsv', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const { teamName, zone, dayCode, date } = req.body;
  console.log(`\nParsing for ${teamName}, Zone: ${zone}, Day Code: ${dayCode}, Date: ${date}`);

  if (!req.files['skillsMatrix'] || !req.files['timegripCsv']) {
    return res.status(400).json({ error: 'Missing required files: skillsMatrix and timegripCsv' });
  }

  const skillsMatrixFile = req.files['skillsMatrix'][0].path;
  const timegripFile = req.files['timegripCsv'][0].path;

  const sheetName = teamName.includes('Team') ? teamName : `Team ${teamName}`;
  const skillsData = await parseSkillsMatrix(skillsMatrixFile, sheetName);
  const timegripData = await parseTimegripCsv(timegripFile, teamName, date);

  const zoneFilePath = ZONE_FILES[zone];
  if (!zoneFilePath) {
    throw new Error(`Unknown zone: ${zone}`);
  }

  if (!fs.existsSync(zoneFilePath)) {
    throw new Error(`Zone file not found: ${zoneFilePath}`);
  }

  const zoneData = parseZoneFile(zoneFilePath);
  const staffingRequirements = zoneData.staffingRequirements[dayCode] || [];

  console.log(`📊 Staffing requirements for ${zone} - Day Code ${dayCode}: ${staffingRequirements.length} positions`);
  if (VERBOSE_API_LOGS) {
    staffingRequirements.forEach(reqItem => {
      console.log(`  ${reqItem.unitName} (${reqItem.position}): ${reqItem.staffNeeded} staff needed`);
    });
  }

  const statistics = {
    staffWithGreenTraining: skillsData.staffWithGreen.length,
    zone,
    dayCode,
    workingStaff: timegripData.workingStaff.length,
    staffingRequirements: staffingRequirements.length
  };

  res.json({
    success: true,
    statistics,
    staffData: skillsData,
    timegripData,
    alerts: timegripData.alerts || null,
    staffingRequirements,
    zone,
    dayCode
  });
}));

module.exports = router;
