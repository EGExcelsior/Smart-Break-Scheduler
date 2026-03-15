/**
 * Unit Mapping Utility
 * 
 * Maps TimeGrip planned functions to actual unit names
 * Handles all the variations in how units are named in TimeGrip vs zone files
 * 
 * @module unitMapping
 * @version 1.0
 */

/**
 * Extract specific unit name from TimeGrip planned function
 * 
 * Maps role names like "Rides - AdventureTreeOperator" to unit names like "Adventure Tree"
 * Returns null for generic retail/admissions to defer to smart assignment logic
 * 
 * @param {string} plannedFunction - Planned function from TimeGrip
 * @returns {string|null} Unit name or null for generic roles
 */
function getSpecificUnitFromFunction(plannedFunction) {
  if (!plannedFunction) return null;
  
  const mapping = {
    // === NEXUS ZONE RIDES ===
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
    'GriffinsGalleonOperato': "Griffin's Galeon", // Handle truncation
    'ROTB Attendant': 'Room on the Broom',
    "Dragon's Playhouse": "Dragon's Playhouse",
    "Dragon'sPlayhouseAttendant": "Dragon's Playhouse",
    "Dragon'sPlayhouseAtten": "Dragon's Playhouse", // TRUNCATED!
    
    // === ODYSSEY ZONE RIDES ===
    "Dragon'sFuryOperator": "Dragon's Fury",
    "Dragon'sFuryAttendant": "Dragon's Fury",
    "DragonsFuryOperator": "Dragon's Fury", // Without apostrophe
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
    
    // === PAW PATROL RIDES ===
    "Paw Patrol Chase's": "Paw Patrol Chase's",
    "PawPatrolChase's": "Paw Patrol Chase's",
    "Paw Patrol Marshall's": "Paw Patrol Marshall's",
    "PawPatrolMarshall's": "Paw Patrol Marshall's",
    "Paw Patrol Skye's": "Paw Patrol Skye's",
    "PawPatrolSkye's": "Paw Patrol Skye's",
    "Paw Patrol Zuma's": "Paw Patrol Zuma's",
    "PawPatrolZuma's": "Paw Patrol Zuma's",
    
    // === PHANTOM ZONE RIDES ===
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
    'Gruffalo': 'Gruffalo River Ride', // Generic fallback
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
    'BarrelsOperator': 'Barrel Bail Out', // TimeGrip says "Barrels"
    'Barrels': 'Barrel Bail Out',
    'Seastorm': 'Seastorm',
    'SeastormOperator': 'Seastorm',
    'SeastormAttendant': 'Seastorm',
    'Seastorm Operator': 'Seastorm',
    'Ostrich Stampede': 'Ostrich Stampede',
    'OstrichStampedeOperator': 'Ostrich Stampede',
    'OstrichStampedeAttendant': 'Ostrich Stampede',
    'Ostrich': 'Ostrich Stampede',
    
    // === BREAK COVER ===
    'Retail Break Cover': 'Retail Break Cover',
    'Retail  - Break Cover': 'Retail Break Cover', // Double space!
    'Rides Break Cover': 'Rides Break Cover',
    
    // === GHI ===
    'GHI Front Desk Host': 'GHI - Hub',
    'GHI Front_Desk_Host': 'GHI - Hub',
    'GHI Senior Host': 'GHI - Hub',
    'GHI Senior_Host': 'GHI - Hub',
    'GHI Help_Squad_Host': 'GHI - Help Squad',
    'GHI Help Squad Host': 'GHI - Help Squad',
    'GHI RAP_Host': 'GHI - Rap',
    'GHI RAP Host': 'GHI - Rap',
    
    // === CAR PARKS / ADMISSIONS ===
    'Car Park - Host': 'Car Parks - Staff Car Park',
    'Car Parks - Host': 'Car Parks - Staff Car Park',
  };
  
  // Try to match keys in the mapping (specific roles first)
  for (const [key, unit] of Object.entries(mapping)) {
    if (plannedFunction.includes(key)) {
      return unit;
    }
  }
  
  // DEFER GENERIC RETAIL: Return null to use smarter assignment logic
  // This finds the retail unit that needs staff most
  if (plannedFunction.includes('Retail') && (plannedFunction.includes('Host') || plannedFunction.includes('Senior'))) {
    return null; // Will be handled in PASS 2 with better matching
  }
  
  // DEFER GENERIC ADMISSIONS: Return null to use smarter assignment logic
  if (plannedFunction.includes('Admissions') && plannedFunction.includes('Host')) {
    return null; // Will be handled in PASS 2 with better matching
  }
  
  return null;
}

/**
 * Validate if staff has skill for a specific unit
 * Used for break cover assignment validation
 * 
 * @param {string} staffName - Staff name
 * @param {string} targetUnit - Unit name to check
 * @param {object} skillsData - Skills Matrix data
 * @returns {boolean} True if staff has required skill
 */
function hasSkillForUnit(staffName, targetUnit, skillsData) {
  const staff = skillsData.staffWithGreen.find(s => s.name === staffName);
  if (!staff) return false;
  
  const unitSkillMap = {
    'Lodge Entrance': 'Admissions',
    'Azteca Entrance': 'Admissions',
    'Explorer Entrance': 'Admissions',
    'Schools Entrance': 'Admissions',
    'Adventures Point Gift Shop': 'Gift Shop',
    'Sweet Shop': 'Retail',
    'Sealife': 'Retail',
    'Lorikeets': 'Retail',
    'Car Parks - Staff Car Park': 'Car Parks',
    'Car Parks - Hotel Car Park': 'Car Parks',
    'Car Parks - Express': 'Car Parks'
  };
  
  const requiredSkill = unitSkillMap[targetUnit];
  if (!requiredSkill) return false;
  
  return (staff.skills || []).some(skill => 
    skill.fullSkill.toLowerCase().includes(requiredSkill.toLowerCase())
  );
}

/**
 * Get position name for a unit
 * Maps unit names to position titles
 * 
 * @param {string} unit - Unit name
 * @returns {string} Position name
 */
function getPositionForUnit(unit) {
  const positionMap = {
    'Gift Shop': 'Retail Host',
    'Adventures Point Gift Shop': 'Retail Host',
    'Sweet Shop': 'Retail Host',
    'Sealife': 'Retail Host',
    'Lodge Entrance': 'Admissions Host',
    'Azteca Entrance': 'Admissions Host',
    'Explorer Entrance': 'Admissions Host',
    'Schools Entrance': 'Admissions Host',
    'Car Parks - Staff Car Park': 'Car Parks Host',
    'Car Parks - Hotel Car Park': 'Car Parks Host'
  };
  
  return positionMap[unit] || `${unit} Host`;
}

module.exports = {
  getSpecificUnitFromFunction,
  hasSkillForUnit,
  getPositionForUnit
};