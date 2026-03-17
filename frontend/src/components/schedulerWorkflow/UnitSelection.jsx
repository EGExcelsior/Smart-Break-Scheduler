import ActionButtons from './ActionButtons';
import UnitsSelector from './UnitsSelector';

const UnitSelection = ({
  units,
  selectedUnits,
  loading,
  canProceed,
  onBack,
  onAutoAssign,
  onUnitToggle,
  onCategoryToggle,
  onResetDefaults,
  onSetAllOpen,
  onSetAllClosed
}) => {
  return (
    <div className="step-content">
      <h2 className="step-title">Step 3: Select Units to Staff</h2>
      <p className="step-subtitle">
        Defaults loaded from Closed Days sheet. Toggle any unit as needed.
        {selectedUnits.length > 0 && <span className="selection-count"> ({selectedUnits.length} units selected)</span>}
      </p>

      <UnitsSelector
        units={units}
        selectedUnits={selectedUnits}
        onUnitToggle={onUnitToggle}
        onCategoryToggle={onCategoryToggle}
      />

      <div className="quick-actions">
        <button className="quick-button secondary" onClick={onResetDefaults}>🔄 Reset Defaults</button>
        <button className="quick-button secondary" onClick={onSetAllOpen}>✓ All Open</button>
        <button className="quick-button secondary" onClick={onSetAllClosed}>✗ All Closed</button>
      </div>

      {selectedUnits.length === 0 && (
        <div className="warning-message">
          <span>⚠️</span>
          <p>No units selected. Select at least one unit to proceed.</p>
        </div>
      )}

      <ActionButtons
        onBack={onBack}
        primaryLabel="Auto-Assign Staff"
        primaryIcon="🎯"
        primaryLoadingLabel="Assigning..."
        onPrimary={onAutoAssign}
        loading={loading}
        disabled={!canProceed}
      />
    </div>
  );
};

export default UnitSelection;
