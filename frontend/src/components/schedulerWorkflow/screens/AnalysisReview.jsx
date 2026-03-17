import ActionButtons from '../ui/ActionButtons';
import StatsGrid from '../ui/StatsGrid';

const AnalysisReview = ({
  analysisResult,
  includedAbsentStaff,
  loading,
  canProceed,
  onBack,
  onLoadUnits,
  onToggleIncludedAbsentStaff
}) => {
  const alertSummary = analysisResult?.alerts;
  const hasAbsenceWithShiftAlerts = (alertSummary?.absenceWithShiftCount || 0) > 0;
  const uniqueAbsenceStaff = [
    ...new Map((alertSummary?.absenceWithShift || []).map((item) => [item.name, item])).values()
  ];

  const stats = [
    { label: 'Staff Available', value: analysisResult.statistics.staffWithGreenTraining, variant: 'success' },
    { label: 'Total Positions', value: analysisResult.statistics.staffingRequirements || 0, variant: 'highlight' },
    { label: 'Staff Working Today', value: analysisResult.statistics.workingStaff, variant: 'info' }
  ];

  return (
    <div className="step-content">
      <div className="step-header">
        <div>
          <p className="step-eyebrow">Validation</p>
          <h2 className="step-title">Readiness Review</h2>
          <p className="step-subtitle">Review staffing balance, inspect warnings, and confirm approved overrides before coverage selection.</p>
        </div>
        <div className="step-panel-note">Only staff you select below are included when absence codes conflict with scheduled shifts.</div>
      </div>

      <div className="readiness-meta-strip">
        <div className="readiness-meta-pill">
          <span>Alerted staff</span>
          <strong>{alertSummary?.absenceWithShiftCount || 0}</strong>
        </div>
        <div className="readiness-meta-pill">
          <span>Overrides selected</span>
          <strong>{includedAbsentStaff.length}</strong>
        </div>
      </div>

      <StatsGrid stats={stats} />

      {hasAbsenceWithShiftAlerts && (
        <section className="warning-message absence-review-panel">
          <span className="warning-icon">⚠️</span>
          <div className="absence-review-content">
            <p className="warning-title">
              {alertSummary.absenceWithShiftCount} staff member(s) have an absence code but still appear on shift in TimeGrip.
            </p>
            <p className="warning-subtitle">
              Select only the people you want to include in this run.
            </p>
            <p className="absence-selected-count">Override selections: {includedAbsentStaff.length}</p>
            <ul className="warning-list">
              {uniqueAbsenceStaff.map((item) => {
                const isChecked = includedAbsentStaff.includes(item.name);
                return (
                <li key={`${item.name}-${item.startTime}-${item.endTime}`} className="warning-list-item">
                  <label className={`warning-checkbox-row ${isChecked ? 'warning-checkbox-row--checked' : ''}`.trim()}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => onToggleIncludedAbsentStaff(item.name, event.target.checked)}
                    />
                    <div>
                      <span className="absence-staff-line">{item.name} ({item.startTime}-{item.endTime})</span>
                      <span className="absence-shift-line">
                        {item.plannedFunction} · Code {item.absenceCode}
                        {item.absenceReason ? ` (${item.absenceReason})` : ''}
                      </span>
                    </div>
                  </label>
                </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {!hasAbsenceWithShiftAlerts && (
        <section className="readiness-clear-panel">
          <span>✅</span>
          <div>
            <h3>No schedule/absence conflicts detected</h3>
            <p>Analysis is clear. Continue to Coverage Selection to choose which units run today.</p>
          </div>
        </section>
      )}

      <ActionButtons
        onBack={onBack}
        primaryLabel="Open Coverage Selection"
        primaryIcon="📋"
        primaryLoadingLabel="Loading Coverage..."
        onPrimary={onLoadUnits}
        loading={loading}
        disabled={!canProceed}
      />
    </div>
  );
};

export default AnalysisReview;
