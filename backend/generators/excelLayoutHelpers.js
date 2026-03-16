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

module.exports = {
  addSpacerRow,
  addMergedHeaderRow,
  addMergedNoteRow,
  renderZonalLeadsSection,
  renderIssuesSection,
  renderUnassignedSection
};