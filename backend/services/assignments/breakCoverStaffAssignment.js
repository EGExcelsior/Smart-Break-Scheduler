'use strict';

/**
 * STEP 5b: Assign Break Cover Staff (Sam, Lydia, etc.)
 *
 * Handles break cover staff assignment after regular retail/admissions staff.
 * - Retail BC: placed at understaffed unit as base, roams across retail
 * - Rides BC: stationary at dedicated role
 * - Fallback: if no BC role, place in admissions/retail host positions
 *
 * @param {object} options
 * @param {object} options.timegripData
 * @param {Array}  options.staffingRequirements
 * @param {Set}    options.assignedStaff         - mutated in place
 * @param {Array}  options.assignments           - mutated in place
 * @param {Map}    options.filledPositions       - mutated in place
 * @param {string} options.zone
 * @param {string} options.dayCode
 * @param {object} options.skillsData
 * @param {Function} options.hasSkillForUnit
 * @param {Function} options.normalizeStaffName
 * @returns {{ assignedCount: number }}
 */
function assignBreakCoverStaff({
  timegripData,
  staffingRequirements,
  assignedStaff,
  assignments,
  filledPositions,
  zone,
  dayCode,
  skillsData,
  hasSkillForUnit,
  normalizeStaffName
}) {
  let assigned = 0;

  // Handle BREAK_COVER staff (Sam, Lydia)
  const breakCoverStaff = timegripData.staffByFunction?.BREAK_COVER || [];
  console.log(`   Found ${breakCoverStaff.length} break cover staff`);

  for (const timegripStaff of breakCoverStaff) {
    if (assignedStaff.has(timegripStaff.name)) continue;

    let assigned_bc = false;

    // ✅ FIX #5: Use plannedFunction (set by parser) not scheduledFunction for break cover type
    const breakCoverType = timegripStaff.plannedFunction || timegripStaff.scheduledFunction || '';
    let matchingBreakCover = null;

    console.log(`  🔍 ${timegripStaff.name}: Break cover type = "${breakCoverType}"`);

    // Get all break cover positions (NO fill check - allow overstaffing)
    // ✅ FIX #5B: Don't restrict by fill count; break cover should always match type
    const breakCoverReqs = staffingRequirements.filter(req =>
      (req.position.includes('Break Cover') || req.unitName.includes('Break Cover'))
    );

    // Match to correct type based on TimeGrip
    if (breakCoverType.includes('Retail')) {
      matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Retail Break Cover'));
    } else if (breakCoverType.includes('Rides')) {
      matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Rides Break Cover'));
    } else if (breakCoverType === '') {
      // ✅ FIX #5: When scheduledFunction is empty, default to Retail Break Cover (more specific)
      matchingBreakCover = breakCoverReqs.find(req => req.unitName.includes('Retail Break Cover'));
    }

    // If type-specific match still not found, take any break cover
    if (!matchingBreakCover && breakCoverReqs.length > 0) {
      matchingBreakCover = breakCoverReqs[0];
    }

    if (matchingBreakCover && breakCoverType.includes('Retail')) {
      // ✅ FIX 21-24: Route Retail BC to understaffed unit as base (not just "Retail Break Cover")
      // They'll rove from their base unit to cover breaks across retail
      const UNIT_ALIASES = {
        'Adventure Point Gift Shop': ['Adventure Point Gift Shop', 'Adventures Point Gift Shop'],
        'Sealife Shop': ['Sealife Shop', 'Sealife']
      };

      const resolveUnitCandidates = (unitName) => UNIT_ALIASES[unitName] || [unitName];

      const findRetailHostReq = (unitName) => {
        const candidates = resolveUnitCandidates(unitName);
        return staffingRequirements.find((req) =>
          candidates.includes(req.unitName) &&
          req.position.includes('Host') &&
          !req.position.includes('Senior Host')
        );
      };

      const getCurrentUnitCoverage = (unitName) => {
        const candidates = resolveUnitCandidates(unitName);
        return assignments.filter((a) =>
          candidates.includes(a.unit) &&
          !a.isBreak &&
          a.staff !== 'UNFILLED'
        ).length;
      };

      // Updated: Prioritize Dragon Treats and Croc Drop Shop for BC base assignment
      const BC_PLACEMENT_PRIORITY = [
        'Dragon Treats', 'Croc Drop Shop',
        'Adventure Point Gift Shop', 'Sweet Shop', "Ben & Jerry's",
        'Explorer Supplies', 'Sealife Shop', 'Lorikeets'
      ];




      // --- Custom logic: assign first BC to Dragon Treats, second to Croc Drop Shop if both are open ---
      // Only applies if both units are in requirements and not already covered
      const bcRetailUnits = ['Dragon Treats', 'Croc Drop Shop'];
      // Track which BCs have been assigned to these units in this run
      if (!global._bcRetailAssigned) global._bcRetailAssigned = {};
      const bcRetailAssigned = global._bcRetailAssigned;



      for (const specialUnit of bcRetailUnits) {
        const candidateReq = findRetailHostReq(specialUnit);
        const alreadyAssigned = assignments.some(a => a.unit === specialUnit && a.isBreakCover);
        if (candidateReq && !alreadyAssigned && !bcRetailAssigned[specialUnit]) {
          bcBaseUnit = candidateReq.unitName;
          bcBaseReq = candidateReq;
          bcRetailAssigned[specialUnit] = true;
          break;
        }
      }
      // Target higher than enforcement minimums so BC staff still get placed
      // APGS target 5 allows both BC persons to base here
      const BC_UNIT_MINIMUMS = {
        'Adventure Point Gift Shop': 5,
        'Sweet Shop': 4,
        "Ben & Jerry's": 3,
        'Explorer Supplies': 2,
        'Sealife Shop': 2,
        'Lorikeets': 2
      };
      // Only skill-gate truly specialized units
      const SKILL_GATED_BC = new Set(["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sweet Shop', 'Sealife Shop']);

      console.log(`  🔍 BC placement debug for ${timegripStaff.name}:`);
      for (const unitName of BC_PLACEMENT_PRIORITY) {
        if (unitName === 'Sealife Shop') {
          const sealifeCount = getCurrentUnitCoverage('Sealife Shop');
          if (sealifeCount >= 2) { console.log(`    ${unitName}: SKIP (Sealife hard cap)`); continue; }
        }
        if (SKILL_GATED_BC.has(unitName) && !hasSkillForUnit(timegripStaff.name, unitName, skillsData)) {
          console.log(`    ${unitName}: SKIP (skill-gated — not trained)`);
          continue;
        }
        const candidateReq = findRetailHostReq(unitName);
        if (!candidateReq) { console.log(`    ${unitName}: SKIP (no req)`); continue; }
        const currentCount = getCurrentUnitCoverage(unitName);
        const minimum = BC_UNIT_MINIMUMS[unitName] || 2;
        console.log(`    ${unitName}: count=${currentCount}, target=${minimum}, placing=${currentCount < minimum}`);
        if (currentCount < minimum) {
          bcBaseUnit = candidateReq.unitName;
          bcBaseReq = candidateReq;
          break;
        }
      }

      // If all minimums are met, still deploy as overflow to the least-covered retail unit
      if (!bcBaseUnit) {
        let bestFallback = null;
        let lowestCount = Number.POSITIVE_INFINITY;

        for (const unitName of BC_PLACEMENT_PRIORITY) {
          if (SKILL_GATED_BC.has(unitName) && !hasSkillForUnit(timegripStaff.name, unitName, skillsData)) {
            continue;
          }

          const candidateReq = findRetailHostReq(unitName);
          if (!candidateReq) {
            continue;
          }

          const currentCount = getCurrentUnitCoverage(unitName);
          if (currentCount < lowestCount) {
            lowestCount = currentCount;
            bestFallback = candidateReq;
          }
        }

        if (bestFallback) {
          bcBaseReq = bestFallback;
          bcBaseUnit = bestFallback.unitName;
          console.log(`  📌 ${timegripStaff.name}: All BC minimums met, deploying as overflow to least-covered unit → ${bcBaseUnit}`);
        }
      }

      if (bcBaseUnit && bcBaseReq) {
        assignments.push({
          unit: bcBaseUnit,
          position: bcBaseReq.position,
          positionType: 'Break Cover (Overflow)',
          staff: timegripStaff.name,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${bcBaseUnit}-Break Cover`,
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: 0,
          isBreak: false,
          isBreakCover: true
        });
        assignedStaff.add(timegripStaff.name);
        console.log(`  ✅ ${timegripStaff.name} → ${bcBaseUnit} [Retail BC — based here, roams for cover]`);
        assigned++;
        assigned_bc = true;
      } else {
        // Fallback: stationary at Retail Break Cover
        const req = matchingBreakCover;
        assignments.push({
          unit: req.unitName,
          position: req.position,
          positionType: 'Break Cover',
          staff: timegripStaff.name,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${req.unitName}-Break Cover`,
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: 0,
          isBreak: false,
          isBreakCover: true
        });
        assignedStaff.add(timegripStaff.name);
        console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} [Retail BC — stationary fallback]`);
        assigned++;
        assigned_bc = true;
      }
    } else if (matchingBreakCover) {
      const req = matchingBreakCover;
      assignments.push({
        unit: req.unitName,
        position: req.position,
        positionType: 'Break Cover',
        staff: timegripStaff.name,
        zone: zone,
        dayCode: dayCode,
        trainingMatch: `${req.unitName}-Break Cover`,
        startTime: timegripStaff.startTime,
        endTime: timegripStaff.endTime,
        breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1d: Include break info
        isBreak: false
      });
      assignedStaff.add(timegripStaff.name);
      filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
      console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (${req.position}) [Break Cover]`);
      assigned++;
      assigned_bc = true;
    }

    // If no break cover role, assign to admissions/retail to cover gaps
    if (!assigned_bc) {
      const fallbackReqs = staffingRequirements.filter(req => {
        const isHost = req.position.includes('Host');
        const isRetailAdmissions = req.unitName.includes('Entrance') || req.unitName.includes('Shop') || req.unitName === 'Sealife';
        const hasCapacity = (filledPositions.get(req.position) || 0) < req.staffNeeded;

        if (!isHost || !isRetailAdmissions || !hasCapacity) return false;

        // ✅ BUG FIX #7b (ENHANCED): Check if position requires Senior Host
        const requiresSeniorHost = req.position.includes('Senior Host');

        if (requiresSeniorHost) {
          // ✅ BUG FIX #7b (ENHANCED): Dual verification - check BOTH Skills Matrix AND TimeGrip
          // Method 1: Check Skills Matrix seniorHosts list
          const inSkillsMatrix = skillsData.seniorHosts && skillsData.seniorHosts.some(sh =>
            normalizeStaffName(sh) === normalizeStaffName(timegripStaff.name)
          );

          // Method 2: Check TimeGrip plannedFunction field
          const inTimeGrip = timegripStaff.plannedFunction &&
                            timegripStaff.plannedFunction.includes('Senior Host');

          // Accept if EITHER source confirms Senior Host status (bulletproof!)
          const isSeniorHost = inSkillsMatrix || inTimeGrip;

          return isSeniorHost;  // Only match if actually a Senior Host
        }

        return true;  // Regular Host - anyone with HOST skill
      }).sort((a, b) => {
        const fillA = filledPositions.get(a.position) || 0;
        const fillB = filledPositions.get(b.position) || 0;
        return fillA - fillB;
      });

      if (fallbackReqs.length > 0) {
        const req = fallbackReqs[0];
        assignments.push({
          unit: req.unitName,
          position: req.position,
          positionType: 'Host (BC fallback)',
          staff: timegripStaff.name,
          zone: zone,
          dayCode: dayCode,
          trainingMatch: `${req.unitName}-Host`,
          startTime: timegripStaff.startTime,
          endTime: timegripStaff.endTime,
          breakMinutes: timegripStaff.scheduledBreakMinutes || 0,  // ✅ FIX #1e: Include break info
          isBreak: false
        });
        assignedStaff.add(timegripStaff.name);
        filledPositions.set(req.position, (filledPositions.get(req.position) || 0) + 1);
        console.log(`  ✅ ${timegripStaff.name} → ${req.unitName} (${req.position}) [Fallback from BC]`);
        assigned++;
      }
    }
  }

  return { assignedCount: assigned };
}

module.exports = { assignBreakCoverStaff };
