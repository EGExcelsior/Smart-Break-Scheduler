import './SchedulerWorkflow.css';
import AnalysisReview from './schedulerWorkflow/screens/AnalysisReview';
import AssignmentReview from './schedulerWorkflow/screens/AssignmentReview';
import UnitSelection from './schedulerWorkflow/screens/UnitSelection';
import UploadConfiguration from './schedulerWorkflow/screens/UploadConfiguration';
import WorkflowCompletion from './schedulerWorkflow/screens/WorkflowCompletion';
import { STEP_LABELS } from './schedulerWorkflow/config/config';
import ErrorMessage from './schedulerWorkflow/ui/ErrorMessage';
import ProgressBar from './schedulerWorkflow/ui/ProgressBar';
import useSchedulerWorkflow from './schedulerWorkflow/hooks/useSchedulerWorkflow';

/**
 * Modern Merlin ShiftFlow UI - V9.0
 * 
 * Features:
 * - Zone selection (Central, Left, Right)
 * - Dynamic day code loading from zone files
 * - Drag & drop file uploads (Skills Matrix + TimeGrip + CWOA)
 * - Unit Status Selector with Closed Days defaults
 * - Manual override for unit open/closed status
 * - Three-pass skill-specific assignment
 * - Real-time validation
 * - Progress indicators
 */

const SchedulerWorkflow = () => {
  const {
    state: {
      currentStep,
      files,
      teamName,
      zone,
      date,
      dayCode,
      dayCodeOptions,
      units,
      selectedUnits,
      analysisResult,
      assignmentResult,
      includedAbsentStaff,
      loading,
      error,
      canProceedStep1,
      canProceedStep2,
      canProceedStep3
    },
    actions: {
      setCurrentStep,
      setDate,
      setDayCode,
      setError,
      handleFileSelect,
      handleFileDrop,
      handleDragOver,
      removeFile,
      handleTeamChange,
      handleFetchUnitStatus,
      handleUnitToggle,
      handleCategoryToggle,
      handleSetAllOpen,
      handleSetAllClosed,
      handleResetDefaults,
      handleParseAnalyze,
      handleAutoAssign,
      handleToggleIncludedAbsentStaff,
      resetWorkflow
    }
  } = useSchedulerWorkflow();

  const currentStepLabel = STEP_LABELS[currentStep - 1];

  return (
    <div className="modern-workflow">
      <section className="workflow-shell">
        <ProgressBar currentStep={currentStep} />
        <ErrorMessage error={error} onDismiss={() => setError(null)} />

        {currentStep === 1 && (
          <UploadConfiguration
            files={files}
            teamName={teamName}
            zone={zone}
            date={date}
            dayCode={dayCode}
            dayCodeOptions={dayCodeOptions}
            loading={loading}
            canProceed={canProceedStep1}
            onFileSelect={handleFileSelect}
            onFileDrop={handleFileDrop}
            onDragOver={handleDragOver}
            onRemoveFile={removeFile}
            onTeamChange={handleTeamChange}
            onDateChange={setDate}
            onDayCodeChange={setDayCode}
            onParseAnalyze={handleParseAnalyze}
          />
        )}

        {currentStep === 2 && analysisResult && (
          <AnalysisReview
            analysisResult={analysisResult}
            includedAbsentStaff={includedAbsentStaff}
            loading={loading}
            canProceed={canProceedStep2}
            onBack={() => setCurrentStep(1)}
            onToggleIncludedAbsentStaff={handleToggleIncludedAbsentStaff}
            onLoadUnits={handleFetchUnitStatus}
          />
        )}

        {currentStep === 3 && units && (
          <UnitSelection
            units={units}
            selectedUnits={selectedUnits}
            loading={loading}
            canProceed={canProceedStep3}
            onBack={() => setCurrentStep(2)}
            onAutoAssign={handleAutoAssign}
            onUnitToggle={handleUnitToggle}
            onCategoryToggle={handleCategoryToggle}
            onResetDefaults={handleResetDefaults}
            onSetAllOpen={handleSetAllOpen}
            onSetAllClosed={handleSetAllClosed}
          />
        )}

        {currentStep === 4 && assignmentResult && (
          <AssignmentReview assignmentResult={assignmentResult} onBack={() => setCurrentStep(3)} />
        )}

        {currentStep === 5 && (
          <WorkflowCompletion
            assignmentResult={assignmentResult}
            selectedUnits={selectedUnits}
            date={date}
            dayCode={dayCode}
            onResetWorkflow={resetWorkflow}
          />
        )}

        <div className="workflow-stage-footer" aria-live="polite">
          <span className="workflow-stage-footer-label">Current stage</span>
          <strong>{currentStepLabel}</strong>
          <p>Step {currentStep} of {STEP_LABELS.length}</p>
        </div>
      </section>
    </div>
  );
};

export default SchedulerWorkflow;
