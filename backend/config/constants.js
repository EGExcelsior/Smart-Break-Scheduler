// ✅ MERLIN SHIFTFLOW CONSTANTS
// All configuration values in one place

// ============================================================================
// COMPETENCY HOURS - Maximum time in role without break
// ============================================================================
const COMPETENCY_HOURS = {
  // 3-Hour Positions (must break by 3 hours)
  'Rattlesnake': 3,
  "Dragon's Fury": 3,
  'Zufari': 3,
  'Tomb Blaster': 3,
  'River Rafts': 3,
  'Croc Drop': 3,
  'Vampire': 3,
  'Gruffalo': 3,
  'Gruffalo River Ride': 3,
  'Mandrill Mayhem': 3,
  'Tiger Rock': 3,
  'Ostrich Stampede': 3,
  
  // 4-Hour Positions (must break by 4 hours)
  'Jungle Rangers': 4,
  'Tree Top Hoppers': 4,
  'Mamba Strike': 4,
  'Blue Barnacle': 4,
  'Seastorm': 4,
  'Trawler Trouble': 4,
  'Barrel Bail Out': 4,
  'Adventure Tree': 4,
  'Tiny Truckers': 4,
  "Elmer's Flying Jumbos": 4,
  "Griffin's Galeon": 4,
  'Sea Dragons': 4,
  "Dragon's Playhouse": 4,
  'Canopy Capers': 4,
  'Room on the Broom': 4,
  
  // 1-Hour Position
  'Tiger Rock CCTV': 1,
  
  // Default for positions not listed
  'DEFAULT': 4
};

// ============================================================================
// OPERATIONAL TIMES
// ============================================================================
const RIDES_OPENING_TIME = '10:00';

// ============================================================================
// RETAIL UNIT PRIORITY FOR SMART BREAK COVER
// ============================================================================
const RETAIL_UNIT_PRIORITY = {
  'Lodge Entrance': 10,
  'Explorer Entrance': 10,
  'Azteca Entrance': 8,
  'Schools Entrance': 7,
  'Adventures Point Gift Shop': 9,
  'Gruffalo Gift Shop': 6,
  'Sweet Shop': 7,
  'Sealife': 5,
  'Ben & Jerry\'s': 4,
  'Ben & Jerry\'s Kiosk': 3,
  'Dragon Treats': 4,
  'Explorer Supplies': 5,
  'Lorikeets': 3
};

// ============================================================================
// UNIT CATEGORIES
// ============================================================================
const UNIT_CATEGORIES = {
  'Rides': [
    // NEXUS RIDES
    'Room on the Broom', 'Adventure Tree', 'Tiny Truckers', "Elmer's Flying Jumbos",
    'Canopy Capers', 'Sea Dragons', "Griffin's Galeon", "Dragon's Playhouse",
    
    // ODYSSEY RIDES
    "Dragon's Fury", 'Tree Top Hoppers', 'Jungle Rangers', 'Rattlesnake', 
    'Tomb Blaster', 'Zufari', 'River Rafts', 'Monkey Swinger', 'Croc Drop',
    "Paw Patrol Chase's", "Paw Patrol Marshall's", "Paw Patrol Skye's", "Paw Patrol Zuma's",
    
    // PHANTOM RIDES
    'Vampire', 'Mandrill Mayhem', 'Mamba Strike', 'Tiger Rock', 'Gruffalo River Ride',
    'Blue Barnacle', 'Trawler Trouble', 'Barrel Bail Out', 'Seastorm', 'Ostrich Stampede'
  ],
  'Admissions': [
    'Lodge Entrance', 'Azteca Entrance', 'Explorer Entrance', 'Schools Entrance', 'Explorer Supplies'
  ],
  'Retail': [
    // NEXUS RETAIL
    'Adventures Point Gift Shop', 'Dragon Treats', 'Lorikeets',
    'Sealife', 'Sweet Shop', "Ben & Jerry's", "Ben & Jerry's Kiosk",
    
    // ODYSSEY RETAIL
    'Croc Drop Shop', 'Freestyle & Vending', 'Freestyle and Vending', 'Freestyle', 'Paw Patrol Shop', 'Zufari Barrow',
    
    // PHANTOM RETAIL
    'Gruffalo Shop', 'Jumanji Shop', 'Shipwreck Kiosk', 'Tiger Kiosk'
  ],
  'Car Parks': [
    'Car Parks - Staff Car Park', 'Car Parks - Hotel Car Park', 'Car Parks - Express',
    'Car Parks - Split', 'Car Parks - Flamingo', 'Car Parks - Giraffe', 'Car Parks - Gorilla',
    'Car Parks - Additional Schools'
  ],
  'GHI': [
    'GHI - Rap', 'GHI - Hub', 'GHI - Help Squad'
  ],
  'Break Cover': [
    'Rides Break Cover', 'Retail Break Cover'
  ]
};

// ============================================================================
// CRITICAL UNITS - Minimum staffing requirements
// ============================================================================
const CRITICAL_UNITS_NEED_MINIMUM_2 = [
  'Lodge Entrance',
  'Explorer Entrance',
  'Azteca Entrance',
  'Schools Entrance',
  'Sweet Shop',
  'Adventures Point Gift Shop'
];

const UNITS_WITH_BREAK_COVER_NEEDED = [
  'Sealife',
  'Lorikeets',
  "Ben & Jerry's",
  'Explorer Supplies',
  "Ben & Jerry's Kiosk"
];

const STAFF_CANNOT_BE_LEFT_ALONE = [
  'Sophie Maher'
];

// ============================================================================
// COVERAGE REQUIREMENTS
// ============================================================================
const MINIMUM_STAFF_REQUIRED = {
  'Lodge Entrance': 2,
  'Adventures Point Gift Shop': 2,
  'Sweet Shop': 2,
  'Sealife': 1,
  'Lorikeets': 1,
  "Ben & Jerry's": 1,
  'Explorer Supplies': 1
};

// ============================================================================
// BREAK SLOTS CONFIGURATION
// ============================================================================
const BREAK_SLOTS = [
  { start: '11:00', end: '11:30', capacity: 2, label: 'Early' },
  { start: '12:00', end: '12:30', capacity: 4, label: 'Peak' },
  { start: '13:00', end: '13:30', capacity: 3, label: 'Late' }
];

// ============================================================================
// SHIFT CLASSIFICATIONS
// ============================================================================
const PRIORITY_UNITS = {
  seniorHost: ['Lodge Entrance', 'Adventures Point Gift Shop', 'Sweet Shop'],
  allDayCoverage: ['Lodge Entrance', 'Adventures Point Gift Shop', 'Sealife', 'Sweet Shop'],
  shortShiftCoverage: ['Lodge Entrance']
};

const FULL_SHIFT_ASSIGNMENTS = [
  { unit: 'Lodge Entrance', count: 1 },
  { unit: 'Adventures Point Gift Shop', count: 2 },
  { unit: 'Sealife', count: 1 },
  { unit: 'Sweet Shop', count: 1 }
];

// ============================================================================
// EXPORT ALL CONSTANTS
// ============================================================================
module.exports = {
  COMPETENCY_HOURS,
  RIDES_OPENING_TIME,
  RETAIL_UNIT_PRIORITY,
  UNIT_CATEGORIES,
  STAFF_CANNOT_BE_LEFT_ALONE,
  CRITICAL_UNITS_NEED_MINIMUM_2,
  UNITS_WITH_BREAK_COVER_NEEDED,
  MINIMUM_STAFF_REQUIRED,
  BREAK_SLOTS,
  PRIORITY_UNITS,
  FULL_SHIFT_ASSIGNMENTS
};
