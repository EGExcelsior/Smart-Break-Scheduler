export const TEAM_TO_ZONE_MAP = {
  Phantom: 'Right_Zone',
  Odyssey: 'Left_Zone',
  Nexus: 'Central_Zone'
};

export const TEAM_OPTIONS = [
  { value: 'Phantom', label: 'Team Phantom (Zone 2 - Right)' },
  { value: 'Odyssey', label: 'Team Odyssey (Zone 3 - Left)' },
  { value: 'Nexus', label: 'Team Nexus (Zone 1 - Central)' }
];

export const STEP_LABELS = [
  'Upload & Configure',
  'Review Analysis',
  'Select Units',
  'Auto-Assign',
  'Complete'
];

export const FILE_CONFIG = {
  skillsMatrix: {
    title: 'Skills Matrix',
    required: true,
    icon: '📊',
    accept: '.xlsx,.xls',
    hint: '.xlsx with team skills'
  },
  timegripCsv: {
    title: 'TimeGrip Export',
    required: true,
    icon: '📋',
    accept: '.csv',
    hint: '.csv from TimeGrip'
  }
};

export const VALID_EXTENSIONS = {
  skillsMatrix: ['.xlsx', '.xls'],
  timegripCsv: ['.csv'],
  cwoaFile: ['.xlsm', '.xlsx']
};
