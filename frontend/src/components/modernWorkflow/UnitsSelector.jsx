const SINGLE_TOGGLE_CATEGORIES = new Set(['Car Parks', 'GHI']);

const UnitsSelector = ({ units, selectedUnits, onUnitToggle, onCategoryToggle }) => {
  return (
    <div className="unit-status-selector">
      {Object.entries(units).map(([category, unitList]) => {
        const isSingleToggleCategory = SINGLE_TOGGLE_CATEGORIES.has(category);
        const allSelected = unitList.every((unit) => selectedUnits.includes(unit.name));
        const anyDefaultClosed = unitList.some((unit) => !unit.originalOpen);

        return (
          <div key={category} className="category-group">
            <div className="category-header">
              <h3>📍 {category}</h3>
              <span className="category-count">
                {unitList.filter((unit) => selectedUnits.includes(unit.name)).length}/{unitList.length}
              </span>
            </div>

            <div className="units-grid">
              {isSingleToggleCategory ? (
                <label className="unit-checkbox unit-checkbox--group">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => onCategoryToggle(unitList, event.target.checked)}
                  />
                  <span className="checkbox-label">
                    {category} ({unitList.length} units)
                  </span>
                  {anyDefaultClosed && <span className="closed-badge" title="Some units default closed">[Partial]</span>}
                </label>
              ) : (
                unitList.map((unit) => (
                  <label key={unit.name} className="unit-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedUnits.includes(unit.name)}
                      onChange={(event) => onUnitToggle(unit.name, event.target.checked)}
                    />
                    <span className="checkbox-label">{unit.name}</span>
                    {!unit.originalOpen && (
                      <span className="closed-badge" title="Default closed from Closed Days">
                        [Closed]
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UnitsSelector;
