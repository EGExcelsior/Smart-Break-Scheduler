import ActionButtons from '../ui/ActionButtons';

const WorkflowCompletion = ({ assignmentResult, selectedUnits, date, dayCode, onResetWorkflow }) => {
  const alertSummary = assignmentResult?.alerts;
  const hasAbsenceWithShiftAlerts = (alertSummary?.absenceWithShiftCount || 0) > 0;
  const assigned = assignmentResult?.assigned || 0;
  const total = assignmentResult?.total || 0;
  const fillRate = assignmentResult?.fillRate || '0%';

  return (
    <div className="step-content">
      <div className="step-header">
        <div>
          <p className="step-eyebrow">Delivery</p>
          <h2 className="step-title">Planner Complete</h2>
          <p className="step-subtitle">Your planner file is ready. Review final run metrics and any follow-up flags before starting a new run.</p>
        </div>
        <div className="step-panel-note">Output reflects your selected units, date, day code, and override decisions for this session.</div>
      </div>

      <div className="completion-metrics">
        <div className="completion-metric-pill">
          <span>Assigned</span>
          <strong>{assigned}</strong>
        </div>
        <div className="completion-metric-pill">
          <span>Total required</span>
          <strong>{total}</strong>
        </div>
        <div className="completion-metric-pill completion-metric-pill--accent">
          <span>Fill rate</span>
          <strong>{fillRate}</strong>
        </div>
      </div>

      <div className="success-message">
        <span className="success-icon">✅</span>
        <h2>Planner file generated successfully</h2>
        <p>
          Your Excel planner has been downloaded with {assigned} of {total}{' '}
          positions filled ({fillRate}).
        </p>
        <p className="success-detail">
          {selectedUnits.length} units were staffed on {date} (Day Code {dayCode})
        </p>
      </div>

      {hasAbsenceWithShiftAlerts && (
        <div className="warning-message completion-warning-panel">
          <span className="warning-icon">⚠️</span>
          <div>
            <p className="warning-title">
              Review needed: {alertSummary.absenceWithShiftCount} staff member(s) had an Absence Code but still appeared with a shift.
            </p>
            {(alertSummary.absenceIncludedByOverrideCount || 0) > 0 && (
              <p className="warning-subtitle">{alertSummary.absenceIncludedByOverrideCount} were included via override selection.</p>
            )}
            <ul className="warning-list">
              {alertSummary.absenceWithShift.map((item) => (
                <li key={`${item.name}-${item.startTime}-${item.endTime}`} className="warning-list-item">
                  <span className="absence-staff-line">{item.name} ({item.startTime}-{item.endTime})</span>
                  <span className="absence-shift-line">
                    {item.plannedFunction} · Code {item.absenceCode}
                    {item.absenceReason ? ` (${item.absenceReason})` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!hasAbsenceWithShiftAlerts && (
        <section className="readiness-clear-panel">
          <span>✅</span>
          <div>
            <h3>No follow-up alerts detected</h3>
            <p>This run completed cleanly with no absence/shift conflicts requiring post-review.</p>
          </div>
        </section>
      )}

      <ActionButtons primaryLabel="Start New Planner Run" primaryIcon="🔄" onPrimary={onResetWorkflow} />
    </div>
  );
};

export default WorkflowCompletion;
