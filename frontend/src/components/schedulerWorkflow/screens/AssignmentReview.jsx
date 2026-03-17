import ActionButtons from '../ui/ActionButtons';
import StatsGrid from '../ui/StatsGrid';

const AssignmentReview = ({ assignmentResult, onBack }) => {
  const assigned = assignmentResult.assigned || 0;
  const total = assignmentResult.total || 0;
  const fillRateValue = Number.parseInt(assignmentResult.fillRate || '0', 10) || 0;
  const unfilled = Math.max(total - assigned, 0);

  const stats = [
    { label: 'Positions Filled', value: assigned, variant: 'success' },
    { label: 'Total Selected', value: total, variant: 'info' },
    { label: 'Fill Rate', value: assignmentResult.fillRate || '0%', variant: 'highlight' }
  ];

  return (
    <div className="step-content">
      <div className="step-header">
        <div>
          <p className="step-eyebrow">Results</p>
          <h2 className="step-title">Assignment Review</h2>
          <p className="step-subtitle">Review assignment coverage and decide whether to adjust Coverage Selection before finalizing this run.</p>
        </div>
        <div className="step-panel-note">Fill rate compares assigned roles against selected unit requirements.</div>
      </div>

      <div className="assignment-insight-strip">
        <div className="assignment-insight-pill">
          <span>Coverage quality</span>
          <strong>{fillRateValue >= 90 ? 'Strong' : fillRateValue >= 75 ? 'Good' : 'Needs review'}</strong>
        </div>
        <div className="assignment-insight-pill">
          <span>Unfilled positions</span>
          <strong>{unfilled}</strong>
        </div>
      </div>

      <StatsGrid stats={stats} />
      <ActionButtons backLabel="← Back to Coverage Selection" onBack={onBack} />
    </div>
  );
};

export default AssignmentReview;
