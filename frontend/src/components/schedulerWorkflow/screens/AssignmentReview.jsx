import ActionButtons from '../ui/ActionButtons';
import StatsGrid from '../ui/StatsGrid';

const AssignmentReview = ({ assignmentResult, onBack }) => {
  const stats = [
    { label: 'Positions Filled', value: assignmentResult.assigned || 0, variant: 'success' },
    { label: 'Total Selected', value: assignmentResult.total || 0, variant: 'info' },
    { label: 'Fill Rate', value: assignmentResult.fillRate || '0%', variant: 'highlight' }
  ];

  return (
    <div className="step-content">
      <h2 className="step-title">Assignment Review</h2>
      <StatsGrid stats={stats} />
      <ActionButtons onBack={onBack} />
    </div>
  );
};

export default AssignmentReview;
