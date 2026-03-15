import React, { useState, useCallback } from 'react';
import './ModernWorkflow.css';

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
  const [currentStep, setCurrentStep] = useState(1);
  const [files, setFiles] = useState({
    skillsMatrix: null,
    timegripCsv: null,
  });
  const [teamName, setTeamName] = useState('');
  const [zone, setZone] = useState('');
  const [date, setDate] = useState('');
  const [dayCode, setDayCode] = useState('');
  const [dayCodeOptions, setDayCodeOptions] = useState([]);
  
  // ✨ V9.0: Unit status selector state
  const [units, setUnits] = useState(null);  // { "Rides": [...], "Retail": [...], ... }
  const [selectedUnits, setSelectedUnits] = useState([]);
  
  const [analysisResult, setAnalysisResult] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Map team to zone
  const teamToZoneMap = {
    'Phantom': 'Right_Zone',  // ✅ CORRECTED: Phantom is RIGHT zone
    'Odyssey': 'Left_Zone',   // ✅ CORRECTED: Odyssey is LEFT zone
    'Nexus': 'Central_Zone'
  };

  // ========================================================================
  // FILE UPLOAD HANDLERS
  // ========================================================================

  const handleFileSelect = (fileType) => (event) => {
    const file = event.target.files[0];
    if (file) {
      setFiles(prev => ({ ...prev, [fileType]: file }));
      setError(null);
    }
  };

  const handleFileDrop = (fileType) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    
    const file = event.dataTransfer.files[0];
    if (file) {
      // Validate file type
      const validExtensions = {
        skillsMatrix: ['.xlsx', '.xls'],
        timegripCsv: ['.csv'],
        cwoaFile: ['.xlsm', '.xlsx']  // ✨ V9.0: Changed from allocationTemplate
      };
      
      const fileName = file.name.toLowerCase();
      const isValid = validExtensions[fileType].some(ext => fileName.endsWith(ext));
      
      if (isValid) {
        setFiles(prev => ({ ...prev, [fileType]: file }));
        setError(null);
      } else {
        setError(`Invalid file type for ${fileType}. Expected: ${validExtensions[fileType].join(', ')}`);
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const removeFile = (fileType) => {
    setFiles(prev => ({ ...prev, [fileType]: null }));
  };

  // ========================================================================
  // TEAM SELECTION HANDLER
  // ========================================================================

  const handleTeamChange = async (selectedTeam) => {
    setTeamName(selectedTeam);
    setDayCode('');
    
    // ✅ CRITICAL FIX: Clear all workflow state when changing teams
    setUnits(null);
    setSelectedUnits([]);
    setAnalysisResult(null);
    setAssignmentResult(null);
    setCurrentStep(1);
    
    if (!selectedTeam) {
      setZone('');
      setDayCodeOptions([]);
      return;
    }
    
    const selectedZone = teamToZoneMap[selectedTeam];
    setZone(selectedZone);
    
    console.log(`🔄 Team changed to: ${selectedTeam} → Zone: ${selectedZone}`);
    
    try {
      console.log(`Fetching day codes for zone: ${selectedZone}`);
      const response = await fetch('/api/day-codes-for-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: selectedZone })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('Day codes received:', data.dayCodeOptions);
        setDayCodeOptions(data.dayCodeOptions || []);
      } else {
        console.error('Error fetching day codes:', data.error);
        setError(data.error || 'Failed to load day codes');
      }
    } catch (err) {
      console.error('Error fetching day codes:', err);
      setError('Failed to load day codes: ' + err.message);
    }
  };

  // ========================================================================
  // ✨ V9.0: UNIT STATUS SELECTOR HANDLERS
  // ========================================================================

  const fetchUnitStatus = async () => {
  setLoading(true);
  setError(null);

  try {
    console.log(`📊 Fetching units for zone: ${zone}, date: ${date}, dayCode: ${dayCode}`);
    
    const response = await fetch('/api/get-unit-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },  // ✨ NEW
      body: JSON.stringify({                             // ✨ CHANGED
        zone: zone,                                      // ✨ NEW
        date: date,
        dayCode: dayCode
      })
    });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load unit status');
      }

      console.log(`✅ Units loaded for zone ${data.zone}:`, Object.keys(data.units));
      console.log(`📋 Full unit data:`, data.units);
      
      setUnits(data.units);
      
      // Initialize selectedUnits with all open units
      const allUnits = Object.values(data.units).flat();
      const openUnits = allUnits.filter(u => u.isOpen).map(u => u.name);
      setSelectedUnits(openUnits);
      
      setCurrentStep(3); // Move to unit selection step
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnitToggle = (unitName, isOpen) => {
    setSelectedUnits(prev => {
      if (isOpen) {
        return [...prev, unitName];
      } else {
        return prev.filter(name => name !== unitName);
      }
    });
  };

  const handleSetAllOpen = () => {
    if (units) {
      const allUnits = Object.values(units).flat();
      setSelectedUnits(allUnits.map(u => u.name));
    }
  };

  const handleSetAllClosed = () => {
    setSelectedUnits([]);
  };

  const handleResetDefaults = () => {
    if (units) {
      const allUnits = Object.values(units).flat();
      setSelectedUnits(allUnits.filter(u => u.originalOpen).map(u => u.name));
    }
  };

  // ========================================================================
  // WORKFLOW STEPS
  // ========================================================================

  const handleParseAnalyze = async () => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('skillsMatrix', files.skillsMatrix);
    formData.append('timegripCsv', files.timegripCsv);
    // ✨ V9.0: Removed allocationTemplate
    formData.append('teamName', teamName);
    formData.append('zone', zone);
    formData.append('date', date);
    formData.append('dayCode', dayCode);

    try {
      const response = await fetch('/api/parse-and-analyze', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Analysis failed');
      }

      setAnalysisResult(data);
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('skillsMatrix', files.skillsMatrix);
    formData.append('timegripCsv', files.timegripCsv);
    formData.append('teamName', teamName);
    formData.append('zone', zone);
    formData.append('date', date);
    formData.append('dayCode', dayCode);
    formData.append('selectedUnits', JSON.stringify(selectedUnits));  // ✨ V9.0: NEW

    try {
      const response = await fetch('/api/auto-assign', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Assignment failed');
      }

      // Handle Excel file download
      if (data.excelFile && data.filename) {
        const binaryString = atob(data.excelFile);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const blob = new Blob([bytes], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log(`✅ Downloaded: ${data.filename} (${data.assigned}/${data.total} positions filled)`);
      }

      const fillRate = data.total > 0 
        ? `${Math.round((data.assigned / data.total) * 100)}%` 
        : '0%';

      setAssignmentResult({
        ...data,
        fillRate
      });
      
      setCurrentStep(5); // Jump to success step
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ========================================================================
  // VALIDATION
  // ========================================================================

  const canProceedStep1 = files.skillsMatrix && files.timegripCsv && teamName && date && dayCode;
  const canProceedStep2 = analysisResult !== null;
  const canProceedStep3 = units !== null && selectedUnits.length > 0;

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div className="modern-workflow">
      {/* ✨ V9.0: Updated Progress Bar with 5 steps */}
      <div className="progress-bar">
        <div className={`progress-step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Upload & Configure</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Review Analysis</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Select Units</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Auto-Assign</div>
        </div>
        <div className="progress-line"></div>
        <div className={`progress-step ${currentStep >= 5 ? 'active' : ''}`}>
          <div className="step-number">5</div>
          <div className="step-label">Complete</div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <span>❌</span>
          <p>{error}</p>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Step 1: Upload Files & Configure */}
      {currentStep === 1 && (
        <div className="step-content">
          <h2 className="step-title">Step 1: Upload Files & Configure</h2>

          {/* File Upload Cards - ✨ V9.0: Changed allocationTemplate to cwoaFile */}
          <div className="upload-cards">
            <div className="upload-card">
              <div className="card-header">
                <h3>Skills Matrix</h3>
                <span className="required-badge">Required</span>
              </div>
              <div 
                className={`upload-zone ${files.skillsMatrix ? 'has-file' : ''}`}
                onDrop={handleFileDrop('skillsMatrix')}
                onDragOver={handleDragOver}
              >
                {files.skillsMatrix ? (
                  <div className="file-preview">
                    <span className="file-icon">📊</span>
                    <span className="file-name">{files.skillsMatrix.name}</span>
                    <button className="remove-btn" onClick={() => removeFile('skillsMatrix')}>×</button>
                  </div>
                ) : (
                  <div className="upload-prompt">
                    <span className="upload-icon">📊</span>
                    <p>Drag & drop or click to upload</p>
                    <p className="upload-hint">.xlsx with team skills</p>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileSelect('skillsMatrix')}
                      style={{ display: 'none' }}
                      id="skillsMatrix"
                    />
                    <label htmlFor="skillsMatrix" className="upload-button">Choose File</label>
                  </div>
                )}
              </div>
            </div>

            <div className="upload-card">
              <div className="card-header">
                <h3>TimeGrip Export</h3>
                <span className="required-badge">Required</span>
              </div>
              <div 
                className={`upload-zone ${files.timegripCsv ? 'has-file' : ''}`}
                onDrop={handleFileDrop('timegripCsv')}
                onDragOver={handleDragOver}
              >
                {files.timegripCsv ? (
                  <div className="file-preview">
                    <span className="file-icon">📋</span>
                    <span className="file-name">{files.timegripCsv.name}</span>
                    <button className="remove-btn" onClick={() => removeFile('timegripCsv')}>×</button>
                  </div>
                ) : (
                  <div className="upload-prompt">
                    <span className="upload-icon">📋</span>
                    <p>Drag & drop or click to upload</p>
                    <p className="upload-hint">.csv from TimeGrip</p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect('timegripCsv')}
                      style={{ display: 'none' }}
                      id="timegripCsv"
                    />
                    <label htmlFor="timegripCsv" className="upload-button">Choose File</label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Section */}
          <div className="config-section">
            <h3>Configuration</h3>
            
            <div className="config-grid">
              <div className="form-group">
                <label htmlFor="team">Select Team</label>
                <select 
                  id="team"
                  value={teamName}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  className="form-select"
                >
                  <option value="">-- Select Team --</option>
                  <option value="Phantom">Team Phantom (Zone 2 - Right)</option>
                  <option value="Odyssey">Team Odyssey (Zone 3 - Left)</option>
                  <option value="Nexus">Team Nexus (Zone 1 - Central)</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="zone">Zone</label>
                <input
                  type="text"
                  id="zone"
                  value={zone.replace(/_/g, ' ')}
                  disabled
                  className="form-input"
                  placeholder="Auto-populated from team"
                />
              </div>

              <div className="form-group">
                <label htmlFor="date">Select Date</label>
                <input
                  type="date"
                  id="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="dayCode">Day Code</label>
                <select
                  id="dayCode"
                  value={dayCode}
                  onChange={(e) => setDayCode(e.target.value)}
                  className="form-select"
                  disabled={!zone || dayCodeOptions.length === 0}
                >
                  <option value="">-- Select Day Code --</option>
                  {dayCodeOptions.map(dc => (
                    <option key={dc.code} value={dc.code}>
                      {dc.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {dayCodeOptions.length === 0 && zone && (
              <p className="info-text">Loading day codes for {zone.replace(/_/g, ' ')}...</p>
            )}
          </div>

          {/* Action Button */}
          <div className="action-section">
            <button
              className="primary-button"
              onClick={handleParseAnalyze}
              disabled={!canProceedStep1 || loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Analyzing...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Parse & Analyze Files
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review Analysis */}
      {currentStep === 2 && analysisResult && (
        <div className="step-content">
          <h2 className="step-title">Step 2: Review Analysis</h2>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{analysisResult.statistics.staffWithGreenTraining}</div>
              <div className="stat-label">Staff Available</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{analysisResult.statistics.staffingRequirements || 0}</div>
              <div className="stat-label">Total Positions</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{analysisResult.statistics.workingStaff}</div>
              <div className="stat-label">Staff Working Today</div>
            </div>
          </div>

          <div className="action-section">
            <button className="secondary-button" onClick={() => setCurrentStep(1)}>
              ← Back
            </button>
            <button
              className="primary-button"
              onClick={fetchUnitStatus}
              disabled={!canProceedStep2 || loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Loading Units...
                </>
              ) : (
                <>
                  <span>📋</span>
                  Select Units to Staff
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ✨ V9.0: Step 3 - Unit Status Selector */}
      {currentStep === 3 && units && (
        <div className="step-content">
          <h2 className="step-title">Step 3: Select Units to Staff</h2>
          <p className="step-subtitle">
            Defaults loaded from Closed Days sheet. Toggle any unit as needed.
            {selectedUnits.length > 0 && (
              <span className="selection-count"> ({selectedUnits.length} units selected)</span>
            )}
          </p>

          {/* Unit Status Selector */}
          <div className="unit-status-selector">
            {Object.entries(units).map(([category, unitList]) => {
              // Car Parks and GHI use a single group toggle instead of individual checkboxes
              const isSingleToggleCategory = category === 'Car Parks' || category === 'GHI';
              const allSelected = unitList.every(u => selectedUnits.includes(u.name));
              const anyDefaultClosed = unitList.some(u => !u.originalOpen);

              const handleGroupToggle = (isOpen) => {
                setSelectedUnits(prev => {
                  const names = unitList.map(u => u.name);
                  if (isOpen) {
                    return [...prev.filter(n => !names.includes(n)), ...names];
                  } else {
                    return prev.filter(n => !names.includes(n));
                  }
                });
              };

              return (
                <div key={category} className="category-group">
                  <div className="category-header">
                    <h3>📍 {category}</h3>
                    <span className="category-count">
                      {unitList.filter(u => selectedUnits.includes(u.name)).length}/{unitList.length}
                    </span>
                  </div>
                  <div className="units-grid">
                    {isSingleToggleCategory ? (
                      // Single toggle for the whole category
                      <label className="unit-checkbox unit-checkbox--group">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => handleGroupToggle(e.target.checked)}
                        />
                        <span className="checkbox-label">
                          {category} ({unitList.length} units)
                        </span>
                        {anyDefaultClosed && (
                          <span className="closed-badge" title="Some units default closed">
                            [Partial]
                          </span>
                        )}
                      </label>
                    ) : (
                      // Individual checkboxes for all other categories
                      unitList.map(unit => (
                        <label key={unit.name} className="unit-checkbox">
                          <input
                            type="checkbox"
                            checked={selectedUnits.includes(unit.name)}
                            onChange={(e) => handleUnitToggle(unit.name, e.target.checked)}
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

          {/* Quick Action Buttons */}
          <div className="quick-actions">
            <button className="quick-button secondary" onClick={handleResetDefaults}>
              🔄 Reset Defaults
            </button>
            <button className="quick-button secondary" onClick={handleSetAllOpen}>
              ✓ All Open
            </button>
            <button className="quick-button secondary" onClick={handleSetAllClosed}>
              ✗ All Closed
            </button>
          </div>

          {/* Selection Summary */}
          {selectedUnits.length === 0 && (
            <div className="warning-message">
              <span>⚠️</span>
              <p>No units selected. Select at least one unit to proceed.</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="action-section">
            <button className="secondary-button" onClick={() => setCurrentStep(2)}>
              ← Back
            </button>
            <button
              className="primary-button"
              onClick={handleAutoAssign}
              disabled={!canProceedStep3 || loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Assigning...
                </>
              ) : (
                <>
                  <span>🎯</span>
                  Auto-Assign Staff
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Review Assignments */}
      {currentStep === 4 && assignmentResult && (
        <div className="step-content">
          <h2 className="step-title">Step 4: Review Assignments</h2>
          
          <div className="stats-grid">
            <div className="stat-card success">
              <div className="stat-value">{assignmentResult.assigned || 0}</div>
              <div className="stat-label">Positions Filled</div>
            </div>
            <div className="stat-card info">
              <div className="stat-value">{assignmentResult.total || 0}</div>
              <div className="stat-label">Total Selected</div>
            </div>
            <div className="stat-card highlight">
              <div className="stat-value">{assignmentResult.fillRate || '0%'}</div>
              <div className="stat-label">Fill Rate</div>
            </div>
          </div>

          <div className="action-section">
            <button className="secondary-button" onClick={() => setCurrentStep(3)}>
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Complete */}
      {currentStep === 5 && (
        <div className="step-content">
          <div className="success-message">
            <span className="success-icon">✅</span>
            <h2>Break Planner Generated Successfully!</h2>
            <p>
              Your Excel planner has been downloaded with {assignmentResult?.assigned || 0} of {assignmentResult?.total || 0} positions filled ({assignmentResult?.fillRate || '0%'}).
            </p>
            <p className="success-detail">
              {selectedUnits.length} units were staffed on {date} (Day Code {dayCode})
            </p>
          </div>

          <div className="action-section">
            <button className="primary-button" onClick={() => {
              setCurrentStep(1);
              setFiles({ skillsMatrix: null, timegripCsv: null, cwoaFile: null });
              setTeamName('');
              setZone('');
              setDate('');
              setDayCode('');
              setUnits(null);
              setSelectedUnits([]);
              setAnalysisResult(null);
              setAssignmentResult(null);
            }}>
              <span>🔄</span>
              Create Another Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModernWorkflow;
