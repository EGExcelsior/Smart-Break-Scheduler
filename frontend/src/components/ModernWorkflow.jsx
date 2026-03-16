import './ModernWorkflow.css';
import ProgressBar from './modernWorkflow/ProgressBar';
import ErrorMessage from './modernWorkflow/ErrorMessage';
import StepOneUploadConfig from './modernWorkflow/StepOneUploadConfig';
import StepTwoReviewAnalysis from './modernWorkflow/StepTwoReviewAnalysis';
import StepThreeSelectUnits from './modernWorkflow/StepThreeSelectUnits';
import StepFourReviewAssignments from './modernWorkflow/StepFourReviewAssignments';
import StepFiveComplete from './modernWorkflow/StepFiveComplete';
import useModernWorkflow from './modernWorkflow/useModernWorkflow';

/**
 * Modern Break Scheduler UI - V9.0
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

const ModernWorkflow = () => {
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
      resetWorkflow
    }
  } = useModernWorkflow();

  return (
    <div className="modern-workflow">
      <ProgressBar currentStep={currentStep} />
      <ErrorMessage error={error} onDismiss={() => setError(null)} />

      {currentStep === 1 && (
        <StepOneUploadConfig
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
        <StepTwoReviewAnalysis
          analysisResult={analysisResult}
          loading={loading}
          canProceed={canProceedStep2}
          onBack={() => setCurrentStep(1)}
          onLoadUnits={handleFetchUnitStatus}
        />
      )}

      {currentStep === 3 && units && (
        <StepThreeSelectUnits
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
        <StepFourReviewAssignments assignmentResult={assignmentResult} onBack={() => setCurrentStep(3)} />
      )}

      {currentStep === 5 && (
        <StepFiveComplete
          assignmentResult={assignmentResult}
          selectedUnits={selectedUnits}
          date={date}
          dayCode={dayCode}
          onResetWorkflow={resetWorkflow}
        />
      )}
    </div>
  );
};

export default ModernWorkflow;
