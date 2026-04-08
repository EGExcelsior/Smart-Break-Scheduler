const FUNCTION_TO_UNIT_MAP = {
  'AdventureTreeOperator': 'Adventure Tree',
  'AdventureTree': 'Adventure Tree',
  'Tiny Truckers Operator': 'Tiny Truckers',
  'TinyTruckersOperator': 'Tiny Truckers',
  'CanopyCapersAttendant': 'Canopy Capers',
  'Canopy Capers': 'Canopy Capers',
  'Sea Dragons Operator': 'Sea Dragons',
  'SeaDragonsOperator': 'Sea Dragons',
  'ElmersOperator': "Elmer's Flying Jumbos",
  'Elmers': "Elmer's Flying Jumbos",
  'GriffinsGalleonOperator': "Griffin's Galeon",
  'GriffinsGalleonOperato': "Griffin's Galeon",
  'ROTB Attendant': 'Room on the Broom',
  "Dragon's Playhouse": "Dragon's Playhouse",
  "Dragon'sPlayhouseAttendant": "Dragon's Playhouse",
  "Dragon'sPlayhouseAtten": "Dragon's Playhouse",
  "Dragon'sFuryOperator": "Dragon's Fury",
  "Dragon'sFuryAttendant": "Dragon's Fury",
  "DragonsFuryOperator": "Dragon's Fury",
  "DragonsFuryAttendant": "Dragon's Fury",
  "Dragon's Fury": "Dragon's Fury",
  'TreetopHoppersOperator': 'Tree Top Hoppers',
  'TreetopHoppersAttendant': 'Tree Top Hoppers',
  'Treetop Hoppers': 'Tree Top Hoppers',
  'JungleRangersOperator': 'Jungle Rangers',
  'JungleRangersAttendant': 'Jungle Rangers',
  'Jungle Rangers': 'Jungle Rangers',
  'Rattlesnake Operator': 'Rattlesnake',
  'Rattlesnake Attendant': 'Rattlesnake',
  'RattlesnakeOperator': 'Rattlesnake',
  'RattlesnakeAttendant': 'Rattlesnake',
  'Tomb Blaster Operator': 'Tomb Blaster',
  'Tomb Blaster Attendant': 'Tomb Blaster',
  'TombBlasterOperator': 'Tomb Blaster',
  'TombBlasterAttendant': 'Tomb Blaster',
  'ZufariOperator': 'Zufari',
  'ZufariAttendant': 'Zufari',
  'Zufari': 'Zufari',
  'River Rafts': 'River Rafts',
  'RiverRaftsOperator': 'River Rafts',
  'RiverRaftsAttendant': 'River Rafts',
  'Monkey Swinger': 'Monkey Swinger',
  'MonkeySwingerOperator': 'Monkey Swinger',
  'MonkeySwingerAttendant': 'Monkey Swinger',
  'Croc Drop': 'Croc Drop',
  'CrocDropOperator': 'Croc Drop',
  'CrocDropAttendant': 'Croc Drop',
  "Paw Patrol Chase's": "Paw Patrol Chase's",
  "PawPatrolChase's": "Paw Patrol Chase's",
  "Paw Patrol Marshall's": "Paw Patrol Marshall's",
  "PawPatrolMarshall's": "Paw Patrol Marshall's",
  "Paw Patrol Skye's": "Paw Patrol Skye's",
  "PawPatrolSkye's": "Paw Patrol Skye's",
  "Paw Patrol Zuma's": "Paw Patrol Zuma's",
  "PawPatrolZuma's": "Paw Patrol Zuma's",
  'Vampire Operator': 'Vampire',
  'Vampire Attendant': 'Vampire',
  'VampireOperator': 'Vampire',
  'VampireAttendant': 'Vampire',
  'Vampire': 'Vampire',
  'Mandrill Mayhem': 'Mandrill Mayhem',
  'MandrillMayhemOperator': 'Mandrill Mayhem',
  'MandrillMayhemAttendant': 'Mandrill Mayhem',
  'Mandrill': 'Mandrill Mayhem',
  'Mamba Strike': 'Mamba Strike',
  'MambaStrikeOperator': 'Mamba Strike',
  'MambaStrikeAttendant': 'Mamba Strike',
  'Mamba': 'Mamba Strike',
  'Tiger Rock': 'Tiger Rock',
  'TigerRockOperator': 'Tiger Rock',
  'TigerRockAttendant': 'Tiger Rock',
  'Gruffalo River Ride': 'Gruffalo River Ride',
  'Gruffalo Operator': 'Gruffalo River Ride',
  'Gruffalo Attendant': 'Gruffalo River Ride',
  'GruffaloOperator': 'Gruffalo River Ride',
  'GruffaloAttendant': 'Gruffalo River Ride',
  'Gruffalo': 'Gruffalo River Ride',
  'Blue Barnacle': 'Blue Barnacle',
  'BlueBarnacleOperator': 'Blue Barnacle',
  'BlueBarnacleAttendant': 'Blue Barnacle',
  'Trawler Trouble': 'Trawler Trouble',
  'TrawlerTroubleOperator': 'Trawler Trouble',
  'TrawlerTroubleAttendant': 'Trawler Trouble',
  'Trawler': 'Trawler Trouble',
  'Barrel Bail Out': 'Barrel Bail Out',
  'BarrelBailOutOperator': 'Barrel Bail Out',
  'BarrelBailOutAttendant': 'Barrel Bail Out',
  'BarrelsOperator': 'Barrel Bail Out',
  'Barrels': 'Barrel Bail Out',
  'Seastorm': 'Seastorm',
  'SeastormOperator': 'Seastorm',
  'SeastormAttendant': 'Seastorm',
  'Seastorm Operator': 'Seastorm',
  'Ostrich Stampede': 'Ostrich Stampede',
  'OstrichStampedeOperator': 'Ostrich Stampede',
  'OstrichStampedeAttendant': 'Ostrich Stampede',
  'Ostrich': 'Ostrich Stampede',
  'Retail Break Cover': 'Retail Break Cover',
  'Retail  - Break Cover': 'Retail Break Cover',
  'Rides Break Cover': 'Rides Break Cover',
  'Freestyle & Vending': 'Freestyle & Vending',
  'Freestyle and Vending': 'Freestyle & Vending',
  'Croc Drop Shop': 'Croc Drop Shop',
  'Dragon Treats': 'Dragon Treats',
  'Paw Patrol Shop': 'Paw Patrol Shop',
  'Zufari Barrow': 'Zufari Barrow',
  'Gruffalo Shop': 'Gruffalo Shop',
  'Gruffalo Gift Shop': 'Gruffalo Gift Shop',
  'Jumanji Shop': 'Jumanji Shop',
  'Shipwreck Kiosk': 'Shipwreck Kiosk',
  'Tiger Kiosk': 'Tiger Kiosk',
  'GHI Front Desk Host': 'GHI - Hub',
  'GHI Front_Desk_Host': 'GHI - Hub',
  'GHI Senior Host': 'GHI - Hub',
  'GHI Senior_Host': 'GHI - Hub',
  'GHI Help_Squad_Host': 'GHI - Help Squad',
  'GHI Help Squad Host': 'GHI - Help Squad',
  'GHI RAP_Host': 'GHI - Rap',
  'GHI RAP Host': 'GHI - Rap',
  'Car Park - Host': 'Car Parks - Staff Car Park',
  'Car Parks - Host': 'Car Parks - Staff Car Park'
};

function getSpecificUnitFromFunction(plannedFunction) {
  if (!plannedFunction) return null;

  // Robust partial match for entrance units and Senior Host roles
  const ENTRANCE_UNITS = [
    'Lodge Entrance',
    'Explorer Entrance',
    'Schools Entrance',
    'Azteca Entrance',
    'Adventure Point Gift Shop',
    'AP Gift Shop'
  ];
  const pfLower = plannedFunction.toLowerCase();
  // Try to match entrance units by partial name
  for (const unit of ENTRANCE_UNITS) {
    if (pfLower.includes(unit.toLowerCase().replace('ap gift shop', 'adventure point gift shop'))) {
      return unit;
    }
    // Also match common abbreviations
    if (unit === 'Adventure Point Gift Shop' && (pfLower.includes('ap gift shop') || pfLower.includes('adventure point gift shop'))) {
      return 'Adventure Point Gift Shop';
    }
  }

  // Fallback to FUNCTION_TO_UNIT_MAP for other units
  for (const [key, unit] of Object.entries(FUNCTION_TO_UNIT_MAP)) {
    if (plannedFunction.includes(key)) {
      return unit;
    }
  }

  // Ignore generic retail/admissions planned functions
  if (plannedFunction.includes('Retail') && (plannedFunction.includes('Host') || plannedFunction.includes('Senior'))) {
    return null;
  }
  if (plannedFunction.includes('Admissions') && plannedFunction.includes('Host')) {
    return null;
  }

  return null;
}

module.exports = {
  getSpecificUnitFromFunction
};
