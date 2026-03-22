// Shared constants and lookup helpers for Excel planner rendering.

const RIDE_COLORS = {
  // === NEXUS ZONE ===
  'Adventure Tree': 'FFC28446',
  'Tiny Truckers': 'FFD600B8',
  "Griffin's Galleon": 'FFFFC000',
  "Griffin's Galeon": 'FFFFC000',
  'Sea Dragons': 'FF33CCCC',
  "Elmer's Flying Jumbos": 'FFFFAFD7',
  "Dragon's Playhouse": 'FF009242',
  'Canopy Capers': 'FF70AD47',
  'Room on the Broom': 'FF7030A0',

  // === ODYSSEY ZONE ===
  "Dragon's Fury": 'FFFF9999',
  'Rattlesnake': 'FF4F81BD',
  'Zufari': 'FFFFFFCC',
  'Croc Drop': 'FFC0504D',
  'River Rafts': 'FFF79646',
  'Tomb Blaster': 'FFCD9B69',
  'Jungle Rangers': 'FF4BACC6',
  'Tree Top Hoppers': 'FFC0504D',
  'Treetop Hoppers': 'FFC0504D',
  'Monkey Swinger': 'FFD9D9D9',

  "Paw Patrol Chase's": 'FF9BBB59',
  "Chase's": 'FF9BBB59',
  "Paw Patrol Marshall's": 'FFF56B6B',
  "Marshall's": 'FFF56B6B',
  "Paw Patrol Skye's": 'FF8064A2',
  "Skye's": 'FF8064A2',
  "Paw Patrol Zuma's": 'FFFFC000',
  "Zumas's": 'FFFFC000',

  // === PHANTOM ZONE ===
  'Vampire': 'FF8064A2',
  'Mandrill Mayhem': 'FF4BACC6',
  'Tiger Rock': 'FFFFC000',
  'Gruffalo River Ride': 'FFFB7A05',
  'Gruffalo': 'FFFB7A05',
  'Ostrich Stampede': 'FF968476',
  'Blue Barnacle': 'FF0070C0',
  'Seastorm': 'FF00B0F0',
  'Mamba Strike': 'FFC00000',
  'Barrel Bail Out': 'FFC28446',
  'Trawler Trouble': 'FFF79646',

  // === RETAIL ===
  'Adventure Point Gift Shop': 'FFC28446',
  'Adventures Point Gift Shop': 'FFC28446',
  'Sweet Shop': 'FFFFAFD7',
  'Sealife': 'FF00B0F0',
  'Sea Life': 'FF00B0F0',
  "Ben & Jerry's": 'FF5B9BD5',
  "Ben & Jerry's Kiosk": 'FF5B9BD5',
  "Ben and Jerry's Kiosk": 'FF5B9BD5',
  'Explorer Supplies': 'FFC55A54',
  'Lorikeets': 'FF70AD47',
  'Dragon Treats': 'FF00B050',

  'Paw Patrol Shop': 'FF00B0F0',
  'Croc Drop Shop': 'FF4BACC6',
  'Gruffalo Shop': 'FFFB7A05',
  'Gruffalo Gift Shop': 'FFFB7A05',
  'Jumanji Shop': 'FF3C7D22',
  'Shipwreck Kiosk': 'FFC28446',
  'Tiger Kiosk': 'FFFFC000',

  // === ADMISSIONS ===
  Admissions: 'FF4BACC6',
  'Lodge Entrance': 'FF4BACC6',
  'Explorer Entrance': 'FF4BACC6',
  'Azteca Entrance': 'FF2E75B6',
  'Schools Entrance': 'FF4BACC6',

  // === GHI ===
  'GHI - Hub': 'FFFFFF99',
  'GHI - Help Squad': 'FFFFFF99',
  'GHI - Rap': 'FFFFFF99',

  // === CAR PARKS ===
  'Car Parks - Staff Car Park': 'FF808080',
  'Car Parks - Hotel Car Park': 'FF808080',

  // === BREAK COVER ===
  'Rides Break Cover': 'FFFF6600',
  'Retail Break Cover': 'FFFF9900'
};

const UNIT_ABBREVIATIONS = {
  'Adventure Tree': 'TREE',
  'Canopy Capers': 'CAPERS',
  "Dragon's Playhouse": 'PLAYHOUSE',
  "Griffin's Galleon": 'GRIFFINS',
  "Griffin's Galeon": 'GRIFFINS',
  'Room on the Broom': 'ROTB',
  'Sea Dragons': 'SEA DRAGS',
  'Tiny Truckers': 'TRUCKERS',
  "Dragon's Fury": 'FURY',
  Rattlesnake: 'RATTLE',
  Zufari: 'ZUFARI',
  'Croc Drop': 'CROC',
  'River Rafts': 'RAFTS',
  'Tomb Blaster': 'TOMB',
  'Jungle Rangers': 'RANGERS',
  'Tree Top Hoppers': 'HOPPERS',
  'Treetop Hoppers': 'HOPPERS',
  'Monkey Swinger': 'MONKEY',
  "Paw Patrol Chase's": 'CHASE',
  "Chase's": 'CHASE',
  "Paw Patrol Marshall's": 'MARSHALL',
  "Marshall's": 'MARSHALL',
  "Paw Patrol Skye's": 'SKYE',
  "Skye's": 'SKYE',
  "Paw Patrol Zuma's": 'ZUMA',
  "Zumas's": 'ZUMA',
  Vampire: 'VAMP',
  'Mandrill Mayhem': 'MANDRILL',
  'Tiger Rock': 'ROCK',
  'Gruffalo River Ride': 'GRUFF',
  Gruffalo: 'GRUFFALO',
  'Ostrich Stampede': 'OSTRICH',
  'Blue Barnacle': 'BARNACLE',
  Seastorm: 'SEASTORM',
  'Mamba Strike': 'MAMBA',
  'Barrel Bail Out': 'BARREL',
  'Trawler Trouble': 'TRAWLER',
  'Adventures Point Gift Shop': 'APGS',
  'Adventure Point Gift Shop': 'APGS',
  'Sweet Shop': 'SWEET',
  Sealife: 'SEA LIFE',
  'Sea Life': 'SEA LIFE',
  "Ben & Jerry's": 'B&Js',
  "Ben & Jerry's Kiosk": 'B&Js KIOSK',
  "Ben and Jerry's Kiosk": 'B&Js KIOSK',
  'Dragon Treats': 'DRAGON TREATS',
  Lorikeets: 'LORIKEETS',
  'Croc Drop Shop': 'CROC SHOP',
  'Freestyle': 'FREESTYLE',
  'Freestyle and Vending': 'FREESTYLE',
  'Freestyle & Vending': 'FREESTYLE',
  'Paw Patrol Shop': 'PAW SHOP',
  'Zufari Barrow': 'ZUFARI BARROW',
  'Gruffalo Shop': 'GRUFF SHOP',
  'Gruffalo Gift Shop': 'GRUFF SHOP',
  'Jumanji Shop': 'JUMANJI',
  'Shipwreck Kiosk': 'SHIPWRECK',
  'Tiger Kiosk': 'TIGER KIOSK',
  'Lodge Entrance': 'LODGE',
  'Explorer Entrance': 'EXPLORER',
  'Azteca Entrance': 'AZTECA',
  'Schools Entrance': 'SCHOOLS',
  'Explorer Supplies': 'SUPPLIES',
  'GHI - Hub': 'GHI',
  'GHI - Help Squad': 'GHI',
  'GHI - Rap': 'GHI',
  'Car Parks - Staff Car Park': 'CAR PARKS',
  'Car Parks - Hotel Car Park': 'CAR PARKS',
  'Car Parks - Express': 'CAR PARKS',
  'Car Parks - Split': 'CAR PARKS',
  'Car Parks - Flamingo': 'CAR PARKS',
  'Car Parks - Giraffe': 'CAR PARKS',
  'Car Parks - Gorilla': 'CAR PARKS',
  'Car Parks - Additional Schools': 'CAR PARKS',
  'Retail Break Cover': 'RETAIL BC',
  'Rides Break Cover': 'RIDES BC'
};

const SENIOR_HOST_COLOR = 'FFB9CDE5';

function normalizeRideUnitName(unitName) {
  if (!unitName) return '';
  return String(unitName)
    .replace(/ ?-? ?(OP|ATT|Operator|Attendant|Host|Driver|Skill|Senior)$/i, '')
    .trim();
}

function getRideColor(unitName) {
  if (!unitName) return null;

  const baseName = normalizeRideUnitName(unitName);

  if (RIDE_COLORS[baseName]) {
    return RIDE_COLORS[baseName];
  }

  for (const [ride, color] of Object.entries(RIDE_COLORS)) {
    if (
      baseName.toLowerCase().includes(ride.toLowerCase()) ||
      ride.toLowerCase().includes(baseName.toLowerCase())
    ) {
      return color;
    }
  }

  return 'FFD9D9D9';
}

function getUnitAbbreviation(unitName) {
  if (!unitName) return null;
  if (UNIT_ABBREVIATIONS[unitName]) return UNIT_ABBREVIATIONS[unitName];

  for (const [key, abbr] of Object.entries(UNIT_ABBREVIATIONS)) {
    if (
      unitName.toLowerCase().includes(key.toLowerCase()) ||
      key.toLowerCase().includes(unitName.toLowerCase())
    ) {
      return abbr;
    }
  }

  return null;
}

module.exports = {
  RIDE_COLORS,
  UNIT_ABBREVIATIONS,
  SENIOR_HOST_COLOR,
  normalizeRideUnitName,
  getRideColor,
  getUnitAbbreviation
};
