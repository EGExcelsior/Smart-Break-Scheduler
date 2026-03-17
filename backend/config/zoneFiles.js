const path = require('path');

const ZONE_FILES = {
  'Central_Zone': path.join(__dirname, '..', 'zone-data', 'Central_Zone.xlsx'),
  'Left_Zone': path.join(__dirname, '..', 'zone-data', 'Left_Zone.xlsx'),
  'Right_Zone': path.join(__dirname, '..', 'zone-data', 'Right_Zone.xlsx')
};

module.exports = {
  ZONE_FILES
};