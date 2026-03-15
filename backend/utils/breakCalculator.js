/**
 * Break Calculator V1.0
 * 
 * Calculates when staff need breaks based on:
 * - RIDES: Competency hours (3-4 hours depending on ride)
 * - RETAIL/ADMISSIONS/CAR PARKS: Fixed time slots (11:00, 12:00, 13:00, 14:00, 15:00)
 * 
 * @module breakCalculator
 * @version 1.0
 */

// ===== COMPETENCY HOURS BY RIDE =====
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
  'Ostrich Stampede': 3, // Without Attendant
  
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
  
  // Default for positions not listed (conservative)
  'DEFAULT': 4
};

// ===== EARLY RIDER RIDES (competency starts from arrival, not 10:00) =====
const EARLY_RIDER_RIDES = [
  'Mandrill Mayhem',
  'Ostrich Stampede',
  'Mamba Strike',
  'Seastorm',
  'Adventure Tree',
  'Gruffalo River',
  'Room on the Broom',
  'Tiny Truckers',
  'Vampire',
  "Dragon's Fury"
];

// ===== FIXED BREAK SLOTS FOR RETAIL/ADMISSIONS/CAR PARKS =====
const FIXED_BREAK_SLOTS = [
  { start: '11:00', end: '11:45', startMinutes: 660, endMinutes: 705 },
  { start: '12:00', end: '12:45', startMinutes: 720, endMinutes: 765 },
  { start: '13:00', end: '13:45', startMinutes: 780, endMinutes: 825 },
  { start: '14:00', end: '14:45', startMinutes: 840, endMinutes: 885 },
  { start: '15:00', end: '15:45', startMinutes: 900, endMinutes: 945 }
];

/**
 * Convert time string to minutes since midnight
 */
function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes to time string
 */
function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

/**
 * Get competency hours for a ride/unit
 */
function getCompetencyHours(unit) {
  const normalized = unit
    .toLowerCase()
    .replace(/-op|-att|-host|-driver|operator|attendant|host/gi, '')
    .trim();
  
  for (const [ride, hours] of Object.entries(COMPETENCY_HOURS)) {
    if (normalized.includes(ride.toLowerCase()) || ride.toLowerCase().includes(normalized)) {
      return hours;
    }
  }
  
  return 4; // Default to 4 hours if not found
}

/**
 * Check if a ride is an early rider
 */
function isEarlyRider(unit) {
  return EARLY_RIDER_RIDES.some(ride => 
    unit.toLowerCase().includes(ride.toLowerCase())
  );
}

/**
 * Calculate when a rides staff member needs their break
 * 
 * @param {string} unit - Unit/ride name
 * @param {string} startTime - Staff start time
 * @param {string} endTime - Staff end time
 * @returns {Array} Array of required breaks [{start, end, reason}]
 */
function calculateRidesBreakTiming(unit, startTime, endTime) {
  const competencyHours = getCompetencyHours(unit);
  const isEarly = isEarlyRider(unit);
  
  const shiftStartMinutes = timeToMinutes(startTime);
  const shiftEndMinutes = timeToMinutes(endTime);
  const shiftDuration = (shiftEndMinutes - shiftStartMinutes) / 60;
  
  if (shiftDuration < 2) {
    return []; // No break needed for shifts <2 hours
  }
  
  // Competency clock starts from:
  // - Arrival time if early rider
  // - 10:00 if regular ride (park opens)
  const competencyStartMinutes = isEarly ? shiftStartMinutes : timeToMinutes('10:00');
  
  // Calculate mandatory break deadline (competency hours from clock start)
  const breakDeadlineMinutes = competencyStartMinutes + (competencyHours * 60);
  
  // Find the best hourly break slot BEFORE deadline
  const breaks = [];
  
  for (const slot of FIXED_BREAK_SLOTS) {
    // Check if slot is during shift AND before deadline AND after 30min into shift
    if (slot.startMinutes >= shiftStartMinutes + 30 && 
        slot.endMinutes <= shiftEndMinutes && 
        slot.startMinutes < breakDeadlineMinutes) {
      breaks.push({
        start: slot.start,
        startMinutes: slot.startMinutes,
        end: slot.end,
        endMinutes: slot.endMinutes,
        reason: `${unit} (${competencyHours}h competency, break by ${minutesToTime(breakDeadlineMinutes)})`
      });
      break; // Use the first valid slot
    }
  }
  
  // If no slot found before deadline, use the last possible slot in shift
  if (breaks.length === 0) {
    for (let i = FIXED_BREAK_SLOTS.length - 1; i >= 0; i--) {
      const slot = FIXED_BREAK_SLOTS[i];
      if (slot.startMinutes >= shiftStartMinutes + 30 && 
          slot.endMinutes <= shiftEndMinutes) {
        breaks.push({
          start: slot.start,
          startMinutes: slot.startMinutes,
          end: slot.end,
          endMinutes: slot.endMinutes,
          reason: `${unit} (${competencyHours}h competency - latest slot)`
        });
        break;
      }
    }
  }
  
  return breaks;
}

/**
 * Calculate fixed break time for retail/admissions/car parks staff
 * 
 * @param {string} startTime - Staff start time
 * @param {string} endTime - Staff end time
 * @returns {Array} Array of required breaks [{start, end, reason}]
 */
function calculateFixedBreakTiming(startTime, endTime) {
  const shiftStartMinutes = timeToMinutes(startTime);
  const shiftEndMinutes = timeToMinutes(endTime);
  const shiftDuration = (shiftEndMinutes - shiftStartMinutes) / 60;
  
  if (shiftDuration < 3) {
    return []; // No break needed for shifts <3 hours
  }
  
  const breaks = [];
  
  // Find appropriate break slot based on shift start
  if (shiftStartMinutes <= 570) { // Started 09:30 or earlier
    // Break at 11:00 or 12:00
    const slot1 = FIXED_BREAK_SLOTS[0]; // 11:00-11:45
    if (slot1.startMinutes >= shiftStartMinutes && slot1.endMinutes <= shiftEndMinutes) {
      breaks.push({
        start: slot1.start,
        startMinutes: slot1.startMinutes,
        end: slot1.end,
        endMinutes: slot1.endMinutes,
        reason: 'Fixed break slot (early start)'
      });
    } else {
      // Try 12:00-12:45
      const slot2 = FIXED_BREAK_SLOTS[1];
      if (slot2.startMinutes >= shiftStartMinutes && slot2.endMinutes <= shiftEndMinutes) {
        breaks.push({
          start: slot2.start,
          startMinutes: slot2.startMinutes,
          end: slot2.end,
          endMinutes: slot2.endMinutes,
          reason: 'Fixed break slot (early start)'
        });
      }
    }
  } else if (shiftStartMinutes <= 630) { // Started 10:30 or earlier
    // Break at 12:00 or 13:00
    const slot2 = FIXED_BREAK_SLOTS[1]; // 12:00-12:45
    if (slot2.startMinutes >= shiftStartMinutes && slot2.endMinutes <= shiftEndMinutes) {
      breaks.push({
        start: slot2.start,
        startMinutes: slot2.startMinutes,
        end: slot2.end,
        endMinutes: slot2.endMinutes,
        reason: 'Fixed break slot (mid start)'
      });
    } else {
      // Try 13:00-13:45
      const slot3 = FIXED_BREAK_SLOTS[2];
      if (slot3.startMinutes >= shiftStartMinutes && slot3.endMinutes <= shiftEndMinutes) {
        breaks.push({
          start: slot3.start,
          startMinutes: slot3.startMinutes,
          end: slot3.end,
          endMinutes: slot3.endMinutes,
          reason: 'Fixed break slot (mid start)'
        });
      }
    }
  } else { // Started after 10:30
    // Break at 13:00 or 14:00
    const slot3 = FIXED_BREAK_SLOTS[2]; // 13:00-13:45
    if (slot3.startMinutes >= shiftStartMinutes && slot3.endMinutes <= shiftEndMinutes) {
      breaks.push({
        start: slot3.start,
        startMinutes: slot3.startMinutes,
        end: slot3.end,
        endMinutes: slot3.endMinutes,
        reason: 'Fixed break slot (late start)'
      });
    } else {
      // Try 14:00-14:45
      const slot4 = FIXED_BREAK_SLOTS[3];
      if (slot4.startMinutes >= shiftStartMinutes && slot4.endMinutes <= shiftEndMinutes) {
        breaks.push({
          start: slot4.start,
          startMinutes: slot4.startMinutes,
          end: slot4.end,
          endMinutes: slot4.endMinutes,
          reason: 'Fixed break slot (late start)'
        });
      }
    }
  }
  
  return breaks;
}

/**
 * Check if a unit is a rides position
 */
function isRidesPosition(unit) {
  const ridesKeywords = ['adventure tree', 'tiny truckers', 'elmer', 'canopy', 'sea dragon', 
                        'griffin', 'dragon', 'room on the broom', 'mandrill', 'ostrich', 
                        'mamba', 'seastorm', 'rattlesnake', 'zufari', 'vampire'];
  
  return ridesKeywords.some(keyword => unit.toLowerCase().includes(keyword));
}

/**
 * Determine break times needed for a staff position
 * 
 * @param {object} assignment - Assignment with unit, position, startTime, endTime
 * @returns {Array} Array of break windows
 */
function calculateBreakTiming(assignment) {
  const { unit, position, startTime, endTime } = assignment;
  
  if (isRidesPosition(unit)) {
    return calculateRidesBreakTiming(unit, startTime, endTime);
  } else {
    return calculateFixedBreakTiming(startTime, endTime);
  }
}

module.exports = {
  calculateBreakTiming,
  calculateRidesBreakTiming,
  calculateFixedBreakTiming,
  getCompetencyHours,
  isEarlyRider,
  isRidesPosition,
  timeToMinutes,
  minutesToTime,
  FIXED_BREAK_SLOTS
};
