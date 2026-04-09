import { useEffect, useMemo, useState } from 'react';
import { TEAM_TO_ZONE_MAP, VALID_EXTENSIONS } from '../config/config';
import {
  autoAssign,
  downloadExcelFile,
  fetchApiHealth,
  fetchDayCodesForZone,
  fetchUnitStatus,
  parseAndAnalyze
} from '../services/api';

const createBaseFormData = ({ files, teamName, zone, date, dayCode }) => {
  const formData = new FormData();
  formData.append('skillsMatrix', files.skillsMatrix);
  formData.append('timegripCsv', files.timegripCsv);
  formData.append('teamName', teamName);
  formData.append('zone', zone);
  formData.append('date', date);
  formData.append('dayCode', dayCode);
  return formData;
};

const LOCKED_OPEN_CATEGORY = 'Zonal Leads';

const getLockedOpenUnitNames = (unitsByCategory) => {
  if (!unitsByCategory || !unitsByCategory[LOCKED_OPEN_CATEGORY]) {
    return [];
  }

  return unitsByCategory[LOCKED_OPEN_CATEGORY].map((unit) => unit.name);
};

const enforceLockedOpenUnits = (selectedUnitNames, unitsByCategory) => {
  const lockedOpenUnitNames = getLockedOpenUnitNames(unitsByCategory);
  return Array.from(new Set([...(selectedUnitNames || []), ...lockedOpenUnitNames]));
};

const parseForcedAbsentNames = (rawInput) => {
  if (Array.isArray(rawInput)) {
    return rawInput.map((value) => String(value || '').trim()).filter(Boolean);
  }

  const text = String(rawInput || '').trim();
  if (!text) {
    return [];
  }

  const normalized = text
    .replace(/\bcalled\s+in\s+sick\b/gi, '')
    .replace(/\bcalled\s+in\b/gi, '')
    .replace(/\bis\s+sick\b/gi, '')
    .replace(/\bsick\b/gi, '')
    .replace(/\bis\s+off\b/gi, '')
    .replace(/\boff\s+today\b/gi, '')
    .replace(/\btoday\b/gi, '')
    .replace(/[.]/g, ' ');

  return normalized
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const useSchedulerWorkflow = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [files, setFiles] = useState({
    skillsMatrix: null,
    timegripCsv: null
  });
  const [teamName, setTeamName] = useState('');
  const [zone, setZone] = useState('');
  const [date, setDate] = useState('');
  const [dayCode, setDayCode] = useState('');
  const [dayCodeOptions, setDayCodeOptions] = useState([]);
  const [units, setUnits] = useState(null);
  const [selectedUnits, setSelectedUnits] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [assignmentResult, setAssignmentResult] = useState(null);
  const [includedAbsentStaff, setIncludedAbsentStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiHealth, setApiHealth] = useState({ checked: false, healthy: true, message: '' });

  const checkApiHealth = async () => {
    try {
      const response = await fetchApiHealth();
      const healthy = Boolean(response?.success);
      setApiHealth({
        checked: true,
        healthy,
        message: healthy ? '' : 'API health check failed. Please verify backend service availability.'
      });
    } catch (requestError) {
      setApiHealth({
        checked: true,
        healthy: false,
        message: requestError.message || 'Unable to reach backend API.'
      });
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  const runWithLoading = async (operation) => {
    setLoading(true);
    setError(null);

    try {
      await operation();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (fileType) => (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    setFiles((prev) => ({ ...prev, [fileType]: file }));
    setError(null);
  };

  const handleFileDrop = (fileType) => (event) => {
    event.preventDefault();
    event.stopPropagation();

    const file = event.dataTransfer.files[0];
    if (!file) {
      return;
    }

    const fileName = file.name.toLowerCase();
    const isValid = VALID_EXTENSIONS[fileType].some((extension) => fileName.endsWith(extension));

    if (!isValid) {
      setError(`Invalid file type for ${fileType}. Expected: ${VALID_EXTENSIONS[fileType].join(', ')}`);
      return;
    }

    setFiles((prev) => ({ ...prev, [fileType]: file }));
    setError(null);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const removeFile = (fileType) => {
    setFiles((prev) => ({ ...prev, [fileType]: null }));
  };

  const handleTeamChange = async (selectedTeam) => {
    setTeamName(selectedTeam);
    setDayCode('');
    setUnits(null);
    setSelectedUnits([]);
    setAnalysisResult(null);
    setAssignmentResult(null);
    setIncludedAbsentStaff([]);
    setCurrentStep(1);

    if (!selectedTeam) {
      setZone('');
      setDayCodeOptions([]);
      return;
    }

    const selectedZone = TEAM_TO_ZONE_MAP[selectedTeam];
    setZone(selectedZone);

    try {
      const data = await fetchDayCodesForZone(selectedZone);
      setDayCodeOptions(data.dayCodeOptions || []);
      setError(null);
    } catch (requestError) {
      setError(`Failed to load day codes: ${requestError.message}`);
    }
  };

  const handleFetchUnitStatus = async () => {
    await runWithLoading(async () => {
      const data = await fetchUnitStatus({ teamName, zone, date, dayCode });
      setUnits(data.units);

      const allUnits = Object.values(data.units).flat();
      const openUnits = allUnits.filter((unit) => unit.isOpen).map((unit) => unit.name);
      setSelectedUnits(enforceLockedOpenUnits(openUnits, data.units));
      setCurrentStep(3);
    });
  };

  const handleUnitToggle = (unitName, isOpen) => {
    const lockedOpenUnitNames = getLockedOpenUnitNames(units);
    if (!isOpen && lockedOpenUnitNames.includes(unitName)) {
      return;
    }

    setSelectedUnits((prev) => {
      if (isOpen) {
        return Array.from(new Set([...prev, unitName]));
      }
      return enforceLockedOpenUnits(prev.filter((name) => name !== unitName), units);
    });
  };

  const handleCategoryToggle = (unitList, isOpen) => {
    const lockedOpenUnitNames = getLockedOpenUnitNames(units);
    setSelectedUnits((prev) => {
      const unitNames = unitList.map((unit) => unit.name);
      if (isOpen) {
        return Array.from(new Set([...prev.filter((name) => !unitNames.includes(name)), ...unitNames]));
      }

      const removableUnitNames = unitNames.filter((name) => !lockedOpenUnitNames.includes(name));
      return enforceLockedOpenUnits(prev.filter((name) => !removableUnitNames.includes(name)), units);
    });
  };

  const handleSetAllOpen = () => {
    if (!units) {
      return;
    }

    const allUnits = Object.values(units).flat();
    setSelectedUnits(Array.from(new Set(allUnits.map((unit) => unit.name))));
  };

  const handleSetAllClosed = () => {
    setSelectedUnits(enforceLockedOpenUnits([], units));
  };

  const handleResetDefaults = () => {
    if (!units) {
      return;
    }

    const allUnits = Object.values(units).flat();
    const defaultOpenUnits = allUnits.filter((unit) => unit.originalOpen).map((unit) => unit.name);
    setSelectedUnits(enforceLockedOpenUnits(defaultOpenUnits, units));
  };

  const handleParseAnalyze = async () => {
    await runWithLoading(async () => {
      const formData = createBaseFormData({ files, teamName, zone, date, dayCode });
      const data = await parseAndAnalyze(formData);
      setAnalysisResult(data);
      setIncludedAbsentStaff([]);
      setCurrentStep(2);
    });
  };

  const handleAutoAssign = async () => {
    await runWithLoading(async () => {
      const formData = createBaseFormData({ files, teamName, zone, date, dayCode });
      formData.append('selectedUnits', JSON.stringify(selectedUnits));
      formData.append('includeAbsentStaff', JSON.stringify(includedAbsentStaff));

      const data = await autoAssign(formData);

      if (data.excelFile && data.filename) {
        downloadExcelFile(data.excelFile, data.filename);
      }

      const fillRate = data.total > 0 ? `${Math.round((data.assigned / data.total) * 100)}%` : '0%';
      setAssignmentResult({ ...data, fillRate });
      setCurrentStep(4);
    });
  };

  const handleRunAbsenceScenario = async (scenarioInput) => {
    const forcedAbsentStaff = parseForcedAbsentNames(scenarioInput);
    if (forcedAbsentStaff.length === 0) {
      setError('Enter at least one staff name for scenario testing.');
      return;
    }

    await runWithLoading(async () => {
      const formData = createBaseFormData({ files, teamName, zone, date, dayCode });
      formData.append('selectedUnits', JSON.stringify(selectedUnits));
      formData.append('includeAbsentStaff', JSON.stringify(includedAbsentStaff));
      formData.append('forceAbsentStaff', JSON.stringify(forcedAbsentStaff));
      formData.append('baselineAssignments', JSON.stringify(assignmentResult?.assignments || []));

      const data = await autoAssign(formData);
      const fillRate = data.total > 0 ? `${Math.round((data.assigned / data.total) * 100)}%` : '0%';

      if (data.excelFile && data.filename) {
        downloadExcelFile(data.excelFile, data.filename);
      }

      setAssignmentResult({
        ...data,
        fillRate,
        scenarioInput: forcedAbsentStaff.join(', ')
      });
      setCurrentStep(4);
    });
  };

  const handleFinalizeAssignmentReview = () => {
    setCurrentStep(5);
  };

  const resetWorkflow = () => {
    setCurrentStep(1);
    setFiles({ skillsMatrix: null, timegripCsv: null });
    setTeamName('');
    setZone('');
    setDate('');
    setDayCode('');
    setDayCodeOptions([]);
    setUnits(null);
    setSelectedUnits([]);
    setAnalysisResult(null);
    setAssignmentResult(null);
    setIncludedAbsentStaff([]);
    setError(null);
  };

  const handleToggleIncludedAbsentStaff = (staffName, shouldInclude) => {
    setIncludedAbsentStaff((prev) => {
      if (shouldInclude) {
        if (prev.includes(staffName)) {
          return prev;
        }
        return [...prev, staffName];
      }
      return prev.filter((name) => name !== staffName);
    });
  };

  const canProceedStep1 = useMemo(() => {
    return Boolean(files.skillsMatrix && files.timegripCsv && teamName && date && dayCode);
  }, [files.skillsMatrix, files.timegripCsv, teamName, date, dayCode]);

  const canProceedStep2 = useMemo(() => analysisResult !== null, [analysisResult]);
  const canProceedStep3 = useMemo(() => units !== null && selectedUnits.length > 0, [units, selectedUnits.length]);

  return {
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
      apiHealth,
      canProceedStep1,
      canProceedStep2,
      canProceedStep3
    },
    actions: {
      setCurrentStep,
      setDate,
      setDayCode,
      setError,
      checkApiHealth,
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
      handleRunAbsenceScenario,
      handleFinalizeAssignmentReview,
      handleToggleIncludedAbsentStaff,
      resetWorkflow
    }
  };
};

export default useSchedulerWorkflow;
