const SINGLE_TOGGLE_CATEGORIES = new Set(['Car Parks', 'GHI']);

const UnitsSelector = ({ units, selectedUnits, lockedOpenUnitNames = [], onUnitToggle, onCategoryToggle }) => {
  return (
    <div className="unit-status-selector">
      {Object.entries(units).map(([category, unitList]) => {
        const isSingleToggleCategory = SINGLE_TOGGLE_CATEGORIES.has(category);
        const allSelected = unitList.every((unit) => selectedUnits.includes(unit.name));
        const anyDefaultClosed = unitList.some((unit) => !unit.originalOpen);
        const selectedCount = unitList.filter((unit) => selectedUnits.includes(unit.name)).length;
        const defaultClosedCount = unitList.filter((unit) => !unit.originalOpen).length;
        const hasLockedOpenUnits = unitList.some((unit) => lockedOpenUnitNames.includes(unit.name));

        return (
          <div key={category} className="category-group">
            <div className="category-header">
              <div className="category-title-block">
                <p className="category-kicker">Category</p>
                <h3>{category}</h3>
              </div>

              <div className="category-meta">
                {defaultClosedCount > 0 && <span className="category-pill category-pill--muted">{defaultClosedCount} default closed</span>}
                <span className="category-count">
                  {selectedCount}/{unitList.length} selected
                </span>
              </div>
            </div>

            <div className="units-grid">
              {isSingleToggleCategory ? (
                <label className={`unit-checkbox unit-checkbox--group ${allSelected ? 'is-selected' : ''}`.trim()}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    disabled={hasLockedOpenUnits}
                    onChange={(event) => onCategoryToggle(unitList, event.target.checked)}
                  />
                  <div className="checkbox-copy">
                    <span className="checkbox-label">{category}</span>
                    <span className="checkbox-meta">{unitList.length} linked units toggle together</span>
                  </div>
                  {hasLockedOpenUnits && <span className="closed-badge closed-badge--locked">Always open</span>}
                  {anyDefaultClosed && <span className="closed-badge" title="Some units default closed">Partial default closure</span>}
                </label>
              ) : (
                unitList.map((unit) => {
                  const isLockedOpen = lockedOpenUnitNames.includes(unit.name);

                  return (
                  <label
                    key={unit.name}
                    className={`unit-checkbox ${selectedUnits.includes(unit.name) ? 'is-selected' : ''} ${!unit.originalOpen ? 'is-default-closed' : ''} ${isLockedOpen ? 'is-locked-open' : ''}`.trim()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnits.includes(unit.name)}
                      disabled={isLockedOpen}
                      onChange={(event) => onUnitToggle(unit.name, event.target.checked)}
                    />
                    <div className="checkbox-copy">
                      <span className="checkbox-label">{unit.name}</span>
                      <span className="checkbox-meta">{isLockedOpen ? 'Always open' : unit.originalOpen ? 'Open by default' : 'Closed by default'}</span>
                    </div>
                    {isLockedOpen && <span className="closed-badge closed-badge--locked">Always open</span>}
                    {!unit.originalOpen && (
                      <span className="closed-badge" title="Default closed from Closed Days">
                        Closed default
                      </span>
                    )}
                  </label>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UnitsSelector;
