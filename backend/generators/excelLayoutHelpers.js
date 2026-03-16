function addSpacerRow(worksheet, height, mergeEndCol) {
  const spacerRow = worksheet.addRow([]);
  spacerRow.height = height;
  if (mergeEndCol) {
    worksheet.mergeCells(`A${spacerRow.number}:${mergeEndCol}${spacerRow.number}`);
  }
  return spacerRow;
}

function addMergedHeaderRow(worksheet, text, {
  mergeEndCol = 'G',
  fontSize = 12,
  fillColor = 'FF4472C4',
  fontColor = 'FFFFFFFF',
  rowHeight = 20
} = {}) {
  const row = worksheet.addRow([]);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = { size: fontSize, bold: true, color: { argb: fontColor } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  row.height = rowHeight;
  worksheet.mergeCells(`A${row.number}:${mergeEndCol}${row.number}`);
  return row;
}

function addMergedNoteRow(worksheet, text, {
  mergeEndCol = 'G',
  fontSize = 10,
  bold = true,
  fontColor = 'FF000000',
  fillColor = 'FFE2EFD9'
} = {}) {
  const row = worksheet.addRow([text]);
  const cell = row.getCell(1);
  cell.font = { size: fontSize, bold, color: { argb: fontColor } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
  worksheet.mergeCells(`A${row.number}:${mergeEndCol}${row.number}`);
  return row;
}

function renderZonalLeadsSection(worksheet, zonalLeads, mergeEndCol = 'G') {
  if (!zonalLeads || zonalLeads.length === 0) return;

  addMergedHeaderRow(worksheet, '🔑 ZONAL LEADS - ROAMING', {
    mergeEndCol,
    fontSize: 13,
    fillColor: 'FF70AD47',
    rowHeight: 20
  });

  for (const lead of zonalLeads) {
    addMergedNoteRow(worksheet, `${lead.staff} (${lead.startTime} - ${lead.endTime})`, {
      mergeEndCol,
      fontSize: 11,
      bold: true,
      fontColor: 'FF000000',
      fillColor: 'FFE2EFD9'
    });
  }

  addSpacerRow(worksheet, 6);
}

function renderIssuesSection(worksheet, alerts, mergeEndCol = 'G') {
  const absenceWithShiftIssues = alerts?.absenceWithShift || [];
  const hasIssues = absenceWithShiftIssues.length > 0;

  addMergedHeaderRow(worksheet, hasIssues
    ? `⚠️ ISSUES TO REVIEW (${absenceWithShiftIssues.length})`
    : '✅ ISSUES TO REVIEW (0)', {
    mergeEndCol,
    fontSize: 12,
    fillColor: hasIssues ? 'FFF4B183' : 'FF70AD47',
    rowHeight: 20
  });

  if (hasIssues) {
    for (const issue of absenceWithShiftIssues) {
      const issueStatus = issue.includedByOverride ? 'INCLUDED BY OVERRIDE' : 'SKIPPED';
      addMergedNoteRow(
        worksheet,
        `${issue.name} (${issue.startTime} - ${issue.endTime}) | ${issue.plannedFunction} | Absence Code: ${issue.absenceCode}${issue.absenceReason ? ` - ${issue.absenceReason}` : ''} | ${issueStatus}`,
        {
          mergeEndCol,
          fontSize: 10,
          bold: true,
          fontColor: 'FF7F6000',
          fillColor: 'FFFFF2CC'
        }
      );
    }
  } else {
    addMergedNoteRow(worksheet, 'No issues detected from TimeGrip absence checks.', {
      mergeEndCol,
      fontSize: 10,
      bold: true,
      fontColor: 'FF1B5E20',
      fillColor: 'FFE2F0D9'
    });
  }

  addSpacerRow(worksheet, 6);
}

function renderUnassignedSection(worksheet, staffList, mergeEndCol = 'G') {
  const unassignedStaff = staffList.filter((s) => s.unassigned);
  if (unassignedStaff.length === 0) return;

  addMergedHeaderRow(worksheet, '❌ UNASSIGNED STAFF', {
    mergeEndCol,
    fontSize: 12,
    fillColor: 'FFFF0000',
    rowHeight: 18
  });

  for (const staff of unassignedStaff) {
    const row = worksheet.addRow([staff.name, `NOT ASSIGNED: ${staff.reason}`]);
    row.height = 25;

    row.getCell(1).font = { bold: true, color: { argb: 'FFFF0000' } };
    row.getCell(2).font = { italic: true, color: { argb: 'FFFF0000' } };

    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6666' } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6666' } };

    worksheet.mergeCells(`B${row.number}:${mergeEndCol}${row.number}`);
  }
}

function renderPlannerHeaderSection(worksheet, {
  teamName,
  date,
  dayCode,
  dayCodeName,
  statsText,
  mergeEndCol = 'G'
}) {
  worksheet.mergeCells(`A1:${mergeEndCol}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = `TEAM ${teamName.toUpperCase()} - BREAK PLANNER`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 25;

  worksheet.mergeCells(`A2:${mergeEndCol}2`);
  const dateCell = worksheet.getCell('A2');
  dateCell.value = `Date: ${new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })}`;
  dateCell.font = { size: 12, bold: true };
  dateCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells(`A3:${mergeEndCol}3`);
  const dayCodeCell = worksheet.getCell('A3');
  dayCodeCell.value = `Day Code: ${dayCode} - ${dayCodeName}`;
  dayCodeCell.font = { size: 11, italic: true };
  dayCodeCell.alignment = { horizontal: 'center' };

  worksheet.mergeCells(`A4:${mergeEndCol}4`);
  const statsCell = worksheet.getCell('A4');
  statsCell.value = statsText;
  statsCell.font = { size: 10 };
  statsCell.alignment = { horizontal: 'center' };
  statsCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE7E6E6' }
  };

  addSpacerRow(worksheet, 6);
}

function renderPlannerLegend(worksheet, timeSlotsCount, legendText) {
  addSpacerRow(worksheet, 6);
  const legendRow = worksheet.addRow(['']);
  legendRow.getCell(1).value = legendText;
  legendRow.getCell(1).font = { italic: true, size: 9 };
  legendRow.getCell(1).alignment = { horizontal: 'left', wrapText: true };
  worksheet.mergeCells(legendRow.number, 1, legendRow.number, Math.min(7, timeSlotsCount + 1));
}

module.exports = {
  addSpacerRow,
  addMergedHeaderRow,
  addMergedNoteRow,
  renderPlannerHeaderSection,
  renderPlannerLegend,
  renderZonalLeadsSection,
  renderIssuesSection,
  renderUnassignedSection
};