import ActionButtons from './ActionButtons';
import StatsGrid from './StatsGrid';

const StepTwoReviewAnalysis = ({ analysisResult, loading, canProceed, onBack, onLoadUnits }) => {
  const stats = [
    { label: 'Staff Available', value: analysisResult.statistics.staffWithGreenTraining },
    { label: 'Total Positions', value: analysisResult.statistics.staffingRequirements || 0 },
    { label: 'Staff Working Today', value: analysisResult.statistics.workingStaff }
  ];

  return (
    <div className="step-content">
      <h2 className="step-title">Step 2: Review Analysis</h2>
      <StatsGrid stats={stats} />
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
