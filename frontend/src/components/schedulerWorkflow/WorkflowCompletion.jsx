import ActionButtons from './ActionButtons';

const WorkflowCompletion = ({ assignmentResult, selectedUnits, date, dayCode, onResetWorkflow }) => {
  const alertSummary = assignmentResult?.alerts;
  const hasAbsenceWithShiftAlerts = (alertSummary?.absenceWithShiftCount || 0) > 0;

  return (
    <div className="step-content">
      <div className="success-message">
        <span className="success-icon">✅</span>
        <h2>Break Planner Generated Successfully!</h2>
        <p>
          Your Excel planner has been downloaded with {assignmentResult?.assigned || 0} of {assignmentResult?.total || 0}{' '}
          positions filled ({assignmentResult?.fillRate || '0%'}).
        </p>
        <p className="success-detail">
          {selectedUnits.length} units were staffed on {date} (Day Code {dayCode})
        </p>
      </div>

      {hasAbsenceWithShiftAlerts && (
        <div className="warning-message">
          <span>⚠️</span>
          <div>
            <p>
              Review needed: {alertSummary.absenceWithShiftCount} staff member(s) had an Absence Code but still appeared with a shift.
            </p>
            {(alertSummary.absenceIncludedByOverrideCount || 0) > 0 && (
              <p>{alertSummary.absenceIncludedByOverrideCount} of these were included by your override selection.</p>
            )}
            <ul className="warning-list">
              {alertSummary.absenceWithShift.map((item) => (
                <li key={`${item.name}-${item.startTime}-${item.endTime}`}>
                  {item.name} ({item.startTime}-{item.endTime}) - {item.plannedFunction} - Code {item.absenceCode}
                  {item.absenceReason ? ` (${item.absenceReason})` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <ActionButtons primaryLabel="Create Another Schedule" primaryIcon="🔄" onPrimary={onResetWorkflow} />
    </div>
  );
};

export default WorkflowCompletion;
