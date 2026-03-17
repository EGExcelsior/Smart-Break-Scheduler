import ActionButtons from '../ui/ActionButtons';
import UnitsSelector from '../ui/UnitsSelector';

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
  const allUnits = Object.values(units).flat();
  const totalUnits = allUnits.length;
  const defaultOpenUnits = allUnits.filter((unit) => unit.originalOpen).length;
  const defaultClosedUnits = totalUnits - defaultOpenUnits;
  const activeCategories = Object.values(units).filter((unitList) => unitList.some((unit) => selectedUnits.includes(unit.name))).length;

  return (
    <div className="step-content">
      <div className="step-header">
        <div>
          <p className="step-eyebrow">Planning Scope</p>
          <h2 className="step-title">Coverage Selection</h2>
          <p className="step-subtitle">
            Review default unit availability, adjust what runs today, and confirm this run’s coverage footprint.
          </p>
        </div>
        <div className="step-panel-note">Closed Days defaults load first, then you can override any unit before assignment.</div>
      </div>

      <div className="selection-overview">
        <div className="selection-summary-card selection-summary-card--primary">
          <span className="selection-summary-label">Units in plan</span>
          <strong>{selectedUnits.length}<span>/ {totalUnits}</span></strong>
          <p>{activeCategories} category groups currently active</p>
        </div>
        <div className="selection-summary-card">
          <span className="selection-summary-label">Default open</span>
          <strong>{defaultOpenUnits}</strong>
          <p>Loaded from Closed Days baseline</p>
        </div>
        <div className="selection-summary-card">
          <span className="selection-summary-label">Default closed</span>
          <strong>{defaultClosedUnits}</strong>
          <p>Available for manual override if needed</p>
        </div>
      </div>

      <div className="selection-toolbar">
        <div className="selection-toolbar-copy">
          <p className="selection-toolbar-kicker">Quick actions</p>
          <h3>Adjust today’s footprint</h3>
          <p>Reset to defaults or switch the full estate open or closed in one action.</p>
        </div>

        <div className="quick-actions">
          <button className="quick-button secondary" onClick={onResetDefaults}>Reset Defaults</button>
          <button className="quick-button secondary" onClick={onSetAllOpen}>Open Everything</button>
          <button className="quick-button secondary" onClick={onSetAllClosed}>Clear Selection</button>
        </div>
      </div>

      <UnitsSelector
        units={units}
        selectedUnits={selectedUnits}
        onUnitToggle={onUnitToggle}
        onCategoryToggle={onCategoryToggle}
      />

      {selectedUnits.length === 0 && (
        <div className="warning-message">
          <span>⚠️</span>
          <p>No units selected. Select at least one unit to proceed.</p>
        </div>
      )}

      <ActionButtons
        onBack={onBack}
        primaryLabel="Build Assignment Plan"
        primaryIcon="🎯"
        primaryLoadingLabel="Building Plan..."
        onPrimary={onAutoAssign}
        loading={loading}
        disabled={!canProceed}
      />
    </div>
  );
};

export default UnitSelection;
