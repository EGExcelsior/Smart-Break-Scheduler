function reassignEntranceStaffAfternoon({
  assignments,
  staffingRequirements,
  skillsData,
  dayCode,
  timeToMinutes,
  hasSkillForUnit
}) {
  console.log('   Analyzing entrance staffing levels post-break...');

  const ENTRANCE_UNITS = ['Lodge Entrance', 'Explorer Entrance', 'Schools Entrance'];
  const AFTERNOON_START = '13:45';

  const availableEntrances = ENTRANCE_UNITS.filter((unit) =>
    staffingRequirements.some((requirement) => requirement.unitName === unit)
  );

  const hasExplorer = availableEntrances.includes('Explorer Entrance');
  const hasSchools = availableEntrances.includes('Schools Entrance');

  const explorerDays = ['E', 'F', 'G', 'H', 'I'];
  const schoolsDays = ['B', 'C', 'D', 'G'];

  const explorerIsBaseline = explorerDays.includes(dayCode);
  const schoolsIsBaseline = schoolsDays.includes(dayCode);

  console.log(`   🚪 Entrances available: ${availableEntrances.join(', ')}`);
  console.log(`   📋 Day Code ${dayCode}: Explorer baseline=${explorerIsBaseline}, Schools baseline=${schoolsIsBaseline}`);

  const afternoonTargets = {};

  if (explorerIsBaseline && schoolsIsBaseline) {
    afternoonTargets['Explorer Entrance'] = 3;
    afternoonTargets['Lodge Entrance'] = 3;
    afternoonTargets['Schools Entrance'] = 3;
    afternoonTargets['Azteca Entrance'] = 2;
  } else if (explorerIsBaseline && !schoolsIsBaseline) {
    afternoonTargets['Explorer Entrance'] = 3;
    afternoonTargets['Lodge Entrance'] = 3;
    afternoonTargets['Azteca Entrance'] = 2;
    if (hasSchools) {
      afternoonTargets['Schools Entrance'] = 2;
      console.log('   ⚠️  Schools manually added to Explorer day - afternoon target = 2');
    }
  } else if (schoolsIsBaseline && !explorerIsBaseline) {
    afternoonTargets['Lodge Entrance'] = 3;
    afternoonTargets['Schools Entrance'] = 3;
    afternoonTargets['Azteca Entrance'] = 2;
    if (hasExplorer) {
      afternoonTargets['Explorer Entrance'] = 2;
      console.log('   ⚠️  Explorer manually added to Schools day - afternoon target = 2 (minimum)');
    }
  } else {
    afternoonTargets['Lodge Entrance'] = 3;
    afternoonTargets['Azteca Entrance'] = 2;
    if (hasExplorer) {
      afternoonTargets['Explorer Entrance'] = 2;
      console.log('   ⚠️  Explorer manually added to Lodge-only day - afternoon target = 2');
    }
    if (hasSchools) {
      afternoonTargets['Schools Entrance'] = 2;
      console.log('   ⚠️  Schools manually added to Lodge-only day - afternoon target = 2');
    }
  }

  for (const entrance of availableEntrances) {
    if (!afternoonTargets[entrance]) {
      afternoonTargets[entrance] = 2;
      console.log(`   ⚠️  ${entrance} fallback target = 2`);
    }
  }

  console.log(`   🎯 Afternoon targets: ${Object.entries(afternoonTargets).map(([unit, count]) => `${unit.replace(' Entrance', '')}=${count}`).join(', ')}`);

  const bjMinStaff = 2;
  const retailPriority = [
    "Ben & Jerry's",
    'Sweet Shop',
    'Adventures Point Gift Shop',
    'Sealife',
    'Explorer Supplies',
    "Ben & Jerry's Kiosk",
    'Lorikeets'
  ];

  const updatedAssignments = [...assignments];
  const reassignments = [];

  for (const entranceUnit of ENTRANCE_UNITS) {
    const targetStaff = afternoonTargets[entranceUnit];
    if (!targetStaff) {
      continue;
    }

    const afternoonStaff = updatedAssignments.filter((assignment) =>
      assignment.unit === entranceUnit &&
      assignment.staff !== 'UNFILLED' &&
      !assignment.isBreak &&
      timeToMinutes(assignment.startTime) <= timeToMinutes(AFTERNOON_START) &&
      timeToMinutes(assignment.endTime) > timeToMinutes(AFTERNOON_START)
    );

    if (afternoonStaff.length <= targetStaff) {
      console.log(`   ✅ ${entranceUnit}: ${afternoonStaff.length} afternoon staff (within target of ${targetStaff})`);
      continue;
    }

    console.log(`   📊 ${entranceUnit}: ${afternoonStaff.length} afternoon staff (target ${targetStaff}, reassign ${afternoonStaff.length - targetStaff} to retail)`);

    const seniorHosts = afternoonStaff.filter((assignment) => assignment.position && assignment.position.includes('Senior Host'));
    const regularHosts = afternoonStaff.filter((assignment) => assignment.position && !assignment.position.includes('Senior Host'));
    const regularHostsNeeded = Math.max(0, targetStaff - seniorHosts.length);
    const toKeep = [...seniorHosts, ...regularHosts.slice(0, regularHostsNeeded)];
    const toReassign = regularHosts.slice(regularHostsNeeded);

    console.log(`   → Keep ${toKeep.length} at ${entranceUnit}: ${toKeep.map((assignment) => assignment.staff).join(', ')}`);
    if (toReassign.length > 0) {
      console.log(`   → Reassign ${toReassign.length} to retail: ${toReassign.map((assignment) => assignment.staff).join(', ')}`);
    }

    const overflowPerUnit = {};
    const maxOverflowPerUnit = 2;

    for (const staffAssignment of toReassign) {
      const staffName = staffAssignment.staff;

      const bjAfternoonStaff = updatedAssignments.filter((assignment) =>
        assignment.unit === "Ben & Jerry's" &&
        assignment.staff !== 'UNFILLED' &&
        !assignment.isBreak &&
        timeToMinutes(assignment.startTime) <= timeToMinutes(AFTERNOON_START) &&
        timeToMinutes(assignment.endTime) > timeToMinutes(AFTERNOON_START)
      );
      const bjCurrentCount = bjAfternoonStaff.length;
      const bjNeedsStaff = bjCurrentCount < bjMinStaff;

      let targetRetailUnit = null;

      if (bjNeedsStaff && hasSkillForUnit(staffName, "Ben & Jerry's", skillsData) &&
        (overflowPerUnit["Ben & Jerry's"] || 0) < maxOverflowPerUnit) {
        targetRetailUnit = "Ben & Jerry's";
        console.log(`   🍦 ${staffName}: ${entranceUnit} → Ben & Jerry's (understaffed: ${bjCurrentCount}/${bjMinStaff}, has skill)`);
      } else {
        for (const retailUnit of retailPriority) {
          const retailReq = staffingRequirements.find((requirement) => requirement.unitName === retailUnit);
          if (!retailReq) {
            continue;
          }
          if ((overflowPerUnit[retailUnit] || 0) >= maxOverflowPerUnit) {
            continue;
          }

          if (hasSkillForUnit(staffName, retailUnit, skillsData)) {
            if (retailUnit === 'Sealife') {
              const sealifeTotal = updatedAssignments.filter((assignment) =>
                assignment.unit === 'Sealife' &&
                assignment.staff !== 'UNFILLED' &&
                !assignment.isBreak &&
                timeToMinutes(assignment.startTime) <= timeToMinutes(AFTERNOON_START) &&
                timeToMinutes(assignment.endTime) > timeToMinutes(AFTERNOON_START)
              ).length;

              if (sealifeTotal >= 2) {
                continue;
              }
            }

            targetRetailUnit = retailUnit;
            console.log(`   ✅ ${staffName}: ${entranceUnit} → ${retailUnit} (skill match)`);
            break;
          }
        }

        if (!targetRetailUnit) {
          const skillRequiredUnits = ["Ben & Jerry's", "Ben & Jerry's Kiosk", 'Sealife'];
          const step6UnitMinimums = {
            'Adventures Point Gift Shop': 3,
            'Sweet Shop': 3,
            'Explorer Supplies': 2,
            'Sealife': 2,
            'Lorikeets': 1,
            "Ben & Jerry's": 2
          };

          targetRetailUnit = retailPriority.find((unit) => {
            const hasUnit = staffingRequirements.some((requirement) => requirement.unitName === unit);
            const belowCap = (overflowPerUnit[unit] || 0) < maxOverflowPerUnit;
            const noSkillRequired = !skillRequiredUnits.includes(unit);
            if (unit === 'Sealife') {
              const sealifeTotal = updatedAssignments.filter((assignment) => assignment.unit === 'Sealife' && !assignment.isBreak && assignment.staff !== 'UNFILLED').length;
              if (sealifeTotal >= 2) {
                return false;
              }
            }
            const currentUnitCount = updatedAssignments.filter((assignment) => assignment.unit === unit && !assignment.isBreak && assignment.staff !== 'UNFILLED').length;
            const unitMin = step6UnitMinimums[unit] || 0;
            if (currentUnitCount >= unitMin) {
              return false;
            }
            return hasUnit && belowCap && noSkillRequired;
          });

          if (!targetRetailUnit) {
            targetRetailUnit = retailPriority.find((unit) => {
              const hasUnit = staffingRequirements.some((requirement) => requirement.unitName === unit);
              const belowCap = (overflowPerUnit[unit] || 0) < maxOverflowPerUnit;
              const noSkillRequired = !skillRequiredUnits.includes(unit);
              if (unit === 'Sealife') {
                const sealifeTotal = updatedAssignments.filter((assignment) => assignment.unit === 'Sealife' && !assignment.isBreak && assignment.staff !== 'UNFILLED').length;
                if (sealifeTotal >= 2) {
                  return false;
                }
              }
              return hasUnit && belowCap && noSkillRequired;
            });
          }

          if (targetRetailUnit) {
            console.log(`   ⚠️  ${staffName}: ${entranceUnit} → ${targetRetailUnit} (fallback, no skill match)`);
          }
        }
      }

      if (!targetRetailUnit) {
        continue;
      }

      overflowPerUnit[targetRetailUnit] = (overflowPerUnit[targetRetailUnit] || 0) + 1;
      for (let index = 0; index < updatedAssignments.length; index++) {
        const assignment = updatedAssignments[index];
        if (assignment.staff !== staffName || assignment.unit !== entranceUnit || assignment.isBreak) {
          continue;
        }

        const assignStart = timeToMinutes(assignment.startTime);
        const assignEnd = timeToMinutes(assignment.endTime);
        const afternoonStartMin = timeToMinutes(AFTERNOON_START);

        if (assignEnd > afternoonStartMin) {
          if (assignStart >= afternoonStartMin) {
            updatedAssignments[index] = {
              ...assignment,
              unit: targetRetailUnit,
              position: 'Retail Host',
              positionType: 'Host (Afternoon Reassignment)',
              category: 'Retail'
            };
          } else if (assignStart < afternoonStartMin && assignEnd > afternoonStartMin) {
            updatedAssignments[index] = {
              ...assignment,
              endTime: AFTERNOON_START
            };

            updatedAssignments.push({
              ...assignment,
              unit: targetRetailUnit,
              position: 'Retail Host',
              positionType: 'Host (Afternoon Reassignment)',
              category: 'Retail',
              startTime: AFTERNOON_START
            });
          }
        }
      }

      reassignments.push({
        staff: staffName,
        from: entranceUnit,
        to: targetRetailUnit
      });
    }
  }

  console.log('\n   🍦 Checking Ben & Jerry\'s staffing needs...');

  const bjUnit = "Ben & Jerry's";
  const sweetUnit = 'Sweet Shop';
  const bjExists = staffingRequirements.some((requirement) => requirement.unitName === bjUnit);
  if (bjExists) {
    const bjAfternoonStaff = updatedAssignments.filter((assignment) =>
      assignment.unit === bjUnit &&
      assignment.staff !== 'UNFILLED' &&
      !assignment.isBreak &&
      timeToMinutes(assignment.startTime) <= timeToMinutes(AFTERNOON_START) &&
      timeToMinutes(assignment.endTime) > timeToMinutes(AFTERNOON_START)
    );

    const bjTarget = 2;
    let bjCurrent = bjAfternoonStaff.length;

    console.log(`   📊 ${bjUnit}: ${bjCurrent}/${bjTarget} afternoon staff`);

    if (bjCurrent < bjTarget) {
      console.log(`   ⚠️  ${bjUnit} understaffed! Looking for skilled staff to cascade...`);
      const sweetAfternoonStaff = updatedAssignments.filter((assignment) =>
        assignment.unit === sweetUnit &&
        assignment.staff !== 'UNFILLED' &&
        !assignment.isBreak &&
        timeToMinutes(assignment.startTime) <= timeToMinutes(AFTERNOON_START) &&
        timeToMinutes(assignment.endTime) > timeToMinutes(AFTERNOON_START)
      );

      for (const sweetAssignment of sweetAfternoonStaff) {
        if (bjCurrent >= bjTarget) {
          break;
        }

        const staffName = sweetAssignment.staff;
        if (!hasSkillForUnit(staffName, bjUnit, skillsData)) {
          continue;
        }

        console.log(`   🔄 CASCADE: ${staffName} has B&J skill, moving from ${sweetUnit} → ${bjUnit}`);
        for (let index = 0; index < updatedAssignments.length; index++) {
          const assignment = updatedAssignments[index];
          if (assignment.staff !== staffName || assignment.unit !== sweetUnit || assignment.isBreak) {
            continue;
          }

          const assignStart = timeToMinutes(assignment.startTime);
          const assignEnd = timeToMinutes(assignment.endTime);
          const afternoonStartMin = timeToMinutes(AFTERNOON_START);

          if (assignEnd > afternoonStartMin) {
            if (assignStart >= afternoonStartMin) {
              updatedAssignments[index] = {
                ...assignment,
                unit: bjUnit
              };
            } else if (assignStart < afternoonStartMin && assignEnd > afternoonStartMin) {
              updatedAssignments[index] = {
                ...assignment,
                endTime: AFTERNOON_START
              };

              updatedAssignments.push({
                ...assignment,
                unit: bjUnit,
                startTime: AFTERNOON_START
              });
            }
          }
        }

        bjCurrent++;
        reassignments.push({
          staff: staffName,
          from: sweetUnit,
          to: bjUnit,
          cascade: true
        });
      }

      if (bjCurrent < bjTarget) {
        console.log(`   ⚠️  ${bjUnit} still needs ${bjTarget - bjCurrent} more skilled staff`);
      }
    }
  }

  if (reassignments.length > 0) {
    console.log(`\n   📊 Afternoon Reassignment Summary: ${reassignments.length} staff moved to retail`);
  } else {
    console.log('\n   ✅ No afternoon reassignments needed (all entrances within 2-3 staff target)');
  }

  return updatedAssignments;
}

module.exports = { reassignEntranceStaffAfternoon };