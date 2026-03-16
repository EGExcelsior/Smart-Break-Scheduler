import ActionButtons from './ActionButtons';

const StepFiveComplete = ({ assignmentResult, selectedUnits, date, dayCode, onResetWorkflow }) => {
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

      <ActionButtons primaryLabel="Create Another Schedule" primaryIcon="🔄" onPrimary={onResetWorkflow} />
    </div>
  );
};

export default StepFiveComplete;
