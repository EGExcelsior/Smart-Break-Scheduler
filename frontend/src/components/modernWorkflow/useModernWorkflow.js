import { useMemo, useState } from 'react';
import { TEAM_TO_ZONE_MAP, VALID_EXTENSIONS } from './config';
import {
  autoAssign,
  downloadExcelFile,
  fetchDayCodesForZone,
  fetchUnitStatus,
  parseAndAnalyze
} from './api';

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

const useModernWorkflow = () => {
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
    setLoading(true);
    setError(null);

    try {
      const data = await fetchUnitStatus({ zone, date, dayCode });
      setUnits(data.units);

      const allUnits = Object.values(data.units).flat();
      const openUnits = allUnits.filter((unit) => unit.isOpen).map((unit) => unit.name);
      setSelectedUnits(openUnits);
      setCurrentStep(3);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnitToggle = (unitName, isOpen) => {
    setSelectedUnits((prev) => {
      if (isOpen) {
        return [...prev, unitName];
      }
      return prev.filter((name) => name !== unitName);
    });
  };

  const handleCategoryToggle = (unitList, isOpen) => {
    setSelectedUnits((prev) => {
      const unitNames = unitList.map((unit) => unit.name);
      if (isOpen) {
        return [...prev.filter((name) => !unitNames.includes(name)), ...unitNames];
      }
      return prev.filter((name) => !unitNames.includes(name));
    });
  };

  const handleSetAllOpen = () => {
    if (!units) {
      return;
    }

    const allUnits = Object.values(units).flat();
    setSelectedUnits(allUnits.map((unit) => unit.name));
  };

  const handleSetAllClosed = () => {
    setSelectedUnits([]);
  };

  const handleResetDefaults = () => {
    if (!units) {
      return;
    }

    const allUnits = Object.values(units).flat();
    setSelectedUnits(allUnits.filter((unit) => unit.originalOpen).map((unit) => unit.name));
  };

  const handleParseAnalyze = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = createBaseFormData({ files, teamName, zone, date, dayCode });
      const data = await parseAndAnalyze(formData);
      setAnalysisResult(data);
      setIncludedAbsentStaff([]);
      setCurrentStep(2);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoAssign = async () => {
    setLoading(true);
    setError(null);

    try {
      const formData = createBaseFormData({ files, teamName, zone, date, dayCode });
      formData.append('selectedUnits', JSON.stringify(selectedUnits));
      formData.append('includeAbsentStaff', JSON.stringify(includedAbsentStaff));

      const data = await autoAssign(formData);

      if (data.excelFile && data.filename) {
        downloadExcelFile(data.excelFile, data.filename);
      }

      const fillRate = data.total > 0 ? `${Math.round((data.assigned / data.total) * 100)}%` : '0%';
      setAssignmentResult({ ...data, fillRate });
      setCurrentStep(5);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
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
  };
};

export default useModernWorkflow;
