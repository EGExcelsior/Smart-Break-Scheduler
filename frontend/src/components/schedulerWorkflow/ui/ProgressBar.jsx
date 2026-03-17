import { Fragment } from 'react';
import { STEP_LABELS } from '../config/config';

const ProgressBar = ({ currentStep }) => {
  const totalSteps = STEP_LABELS.length;

  return (
    <div className="progress-bar" role="list" aria-label="Planner progress">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep >= stepNumber;
        const isCompleted = currentStep > stepNumber;
        const stepStatus = isCompleted ? 'completed' : isActive ? 'current' : 'upcoming';

        return (
          <Fragment key={label}>
            <div
              className={`progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`.trim()}
              role="listitem"
              aria-current={currentStep === stepNumber ? 'step' : undefined}
              aria-label={`Step ${stepNumber} of ${totalSteps}: ${label}, ${stepStatus}`}
            >
              <div className="step-number" aria-hidden="true">{stepNumber}</div>
              <div className="step-label">{label}</div>
            </div>
            {stepNumber < STEP_LABELS.length && <div className="progress-line" aria-hidden="true" />}
          </Fragment>
        );
      })}
    </div>
  );
};

export default ProgressBar;
