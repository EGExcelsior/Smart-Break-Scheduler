import { useMemo, useState } from 'react';
import ActionButtons from '../ui/ActionButtons';
import StatsGrid from '../ui/StatsGrid';

const AssignmentReview = ({ assignmentResult, loading, onBack, onRunScenario, onFinalize }) => {
  const [scenarioInput, setScenarioInput] = useState('');
  const assigned = assignmentResult.assigned || 0;
  const total = assignmentResult.total || 0;
  const fillRateValue = Number.parseInt(assignmentResult.fillRate || '0', 10) || 0;
  const unfilled = Math.max(total - assigned, 0);
  const insights = assignmentResult.insights || {};
  const insightSummary = insights.summary || '';
  const insightWarnings = Array.isArray(insights.warnings) ? insights.warnings : [];
  const scenarioMeta = assignmentResult.scenario || {};
  const scenarioDelta = assignmentResult.scenarioDelta || null;
  const scenarioCoverageDiff = Array.isArray(scenarioDelta?.coverageDiffAt1400) ? scenarioDelta.coverageDiffAt1400 : [];

  const scenarioRunLabel = useMemo(() => {
    if (scenarioMeta.forcedAbsentStaff && scenarioMeta.forcedAbsentStaff.length > 0) {
      return scenarioMeta.forcedAbsentStaff.join(', ');
    }
    return assignmentResult.scenarioInput || '';
  }, [scenarioMeta.forcedAbsentStaff, assignmentResult.scenarioInput]);

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

      {insightSummary && (
        <section className="readiness-clear-panel">
          <span>🧠</span>
          <div>
            <h3>AI Summary</h3>
            <p>{insightSummary}</p>
          </div>
        </section>
      )}

      {insightWarnings.length > 0 && (
        <div className="warning-message completion-warning-panel">
          <span className="warning-icon">⚠️</span>
          <div>
            <p className="warning-title">Detected coverage risks</p>
            <p className="warning-subtitle">Flagged by automated schedule scan.</p>
            <ul className="warning-list">
              {insightWarnings.map((warning, index) => (
                <li key={`${warning.unit || 'unit'}-${warning.startTime || 'start'}-${index}`} className="warning-list-item">
                  <div className="assignment-warning-meta-row">
                    <span className={`assignment-warning-chip assignment-warning-chip--${warning.severity || 'medium'}`}>
                      {(warning.severity || 'medium').toUpperCase()}
                    </span>
                    {warning.unit && <span className="assignment-warning-chip">{warning.unit}</span>}
                    {warning.startTime && warning.endTime && (
                      <span className="assignment-warning-chip">{warning.startTime}-{warning.endTime}</span>
                    )}
                  </div>
                  <span className="assignment-warning-message">{warning.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="scenario-simulator-panel">
        <div className="scenario-simulator-header">
          <h3>Scenario Simulator</h3>
          <p>Type absent staff names and rerun allocation without restarting the workflow.</p>
        </div>

        <div className="scenario-simulator-row">
          <input
            type="text"
            value={scenarioInput}
            onChange={(event) => setScenarioInput(event.target.value)}
            placeholder="e.g. Ella Hart, Rene Omonisa"
            className="scenario-simulator-input"
          />
          <button
            type="button"
            className="primary-button"
            onClick={() => onRunScenario(scenarioInput)}
            disabled={loading || !scenarioInput.trim()}
          >
            {loading ? 'Running scenario…' : 'Run Sick Scenario'}
          </button>
        </div>

        {scenarioRunLabel && (
          <div className="scenario-simulator-summary">
            <p className="scenario-simulator-title">Latest scenario</p>
            <p className="scenario-simulator-text">Forced absent: {scenarioRunLabel}</p>
            {Number.isFinite(scenarioMeta.forcedAbsentRemovedCount) && (
              <p className="scenario-simulator-text">Removed from schedule: {scenarioMeta.forcedAbsentRemovedCount}</p>
            )}
            {scenarioDelta && (
              <>
                <p className="scenario-simulator-text">Reassigned non-absent staff: {scenarioDelta.movedNonAbsentCount || 0}</p>
                {scenarioCoverageDiff.length > 0 && (
                  <ul className="warning-list scenario-delta-list">
                    {scenarioCoverageDiff.slice(0, 5).map((item) => (
                      <li key={`${item.unit}-${item.before}-${item.after}`} className="warning-list-item">
                        <strong>{item.unit}</strong>: {item.before} → {item.after} at 14:00
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <ActionButtons
        backLabel="← Back to Coverage Selection"
        onBack={onBack}
        primaryLabel="Finalize Planner"
        primaryIcon="✅"
        onPrimary={onFinalize}
      />
    </div>
  );
};

export default AssignmentReview;
