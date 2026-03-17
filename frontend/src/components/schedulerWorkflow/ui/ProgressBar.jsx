import { Fragment } from 'react';
import { STEP_LABELS } from '../config/config';

const ProgressBar = ({ currentStep }) => {
  return (
    <div className="progress-bar">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = currentStep >= stepNumber;
        const isCompleted = currentStep > stepNumber;

        return (
          <Fragment key={label}>
            <div
              className={`progress-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`.trim()}
            >
              <div className="step-number">{stepNumber}</div>
              <div className="step-label">{label}</div>
            </div>
            {stepNumber < STEP_LABELS.length && <div className="progress-line" />}
          </Fragment>
        );
      })}
    </div>
  );
};

export default ProgressBar;
