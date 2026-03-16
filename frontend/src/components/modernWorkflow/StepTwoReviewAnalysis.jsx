import ActionButtons from './ActionButtons';
import StatsGrid from './StatsGrid';

const StepTwoReviewAnalysis = ({ analysisResult, loading, canProceed, onBack, onLoadUnits }) => {
  const alertSummary = analysisResult?.alerts;
  const hasAbsenceWithShiftAlerts = (alertSummary?.absenceWithShiftCount || 0) > 0;

  const stats = [
    { label: 'Staff Available', value: analysisResult.statistics.staffWithGreenTraining },
    { label: 'Total Positions', value: analysisResult.statistics.staffingRequirements || 0 },
    { label: 'Staff Working Today', value: analysisResult.statistics.workingStaff }
  ];

  return (
    <div className="step-content">
      <h2 className="step-title">Step 2: Review Analysis</h2>
      <StatsGrid stats={stats} />

      {hasAbsenceWithShiftAlerts && (
        <div className="warning-message">
          <span>⚠️</span>
          <div>
            <p>
              {alertSummary.absenceWithShiftCount} staff member(s) have an Absence Code but also a scheduled shift in TimeGrip.
            </p>
            <p>Please review these records before generating the planner:</p>
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

      <ActionButtons
        onBack={onBack}
        primaryLabel="Select Units to Staff"
        primaryIcon="📋"
        primaryLoadingLabel="Loading Units..."
        onPrimary={onLoadUnits}
        loading={loading}
        disabled={!canProceed}
      />
    </div>
  );
};

export default StepTwoReviewAnalysis;
