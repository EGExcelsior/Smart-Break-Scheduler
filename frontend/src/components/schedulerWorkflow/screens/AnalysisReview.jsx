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
    { label: 'Staff Available', value: analysisResult.statistics.staffWithGreenTraining },
    { label: 'Total Positions', value: analysisResult.statistics.staffingRequirements || 0 },
    { label: 'Staff Working Today', value: analysisResult.statistics.workingStaff }
  ];

  return (
    <div className="step-content">
      <h2 className="step-title">Readiness Review</h2>
      <StatsGrid stats={stats} />

      {hasAbsenceWithShiftAlerts && (
        <div className="warning-message">
          <span className="warning-icon">⚠️</span>
          <div>
            <p className="warning-title">
              {alertSummary.absenceWithShiftCount} staff member(s) have an Absence Code but also a scheduled shift in TimeGrip.
            </p>
            <p className="warning-subtitle">
              Tick any names you want to include anyway for this planner run ({includedAbsentStaff.length} selected):
            </p>
            <ul className="warning-list">
              {uniqueAbsenceStaff.map((item) => {
                const isChecked = includedAbsentStaff.includes(item.name);
                return (
                <li key={`${item.name}-${item.startTime}-${item.endTime}`} className="warning-list-item">
                  <label className="warning-checkbox-row">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(event) => onToggleIncludedAbsentStaff(item.name, event.target.checked)}
                    />
                    <span>
                      {item.name} ({item.startTime}-{item.endTime}) - {item.plannedFunction} - Code {item.absenceCode}
                      {item.absenceReason ? ` (${item.absenceReason})` : ''}
                    </span>
                  </label>
                </li>
                );
              })}
            </ul>
          </div>
        </div>
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
