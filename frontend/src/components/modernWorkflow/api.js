const JSON_HEADERS = { 'Content-Type': 'application/json' };

const parseJsonResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
};

const postJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  });

  return parseJsonResponse(response);
};

const postFormData = async (url, formData) => {
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  });

  return parseJsonResponse(response);
};

export const fetchDayCodesForZone = async (zone) => {
  return postJson('/api/day-codes-for-zone', { zone });
};

export const fetchUnitStatus = async ({ zone, date, dayCode }) => {
  return postJson('/api/get-unit-status', { zone, date, dayCode });
};

export const parseAndAnalyze = async (formData) => {
  return postFormData('/api/parse-and-analyze', formData);
};

export const autoAssign = async (formData) => {
  return postFormData('/api/auto-assign', formData);
};

export const downloadExcelFile = (excelBase64, filename) => {
  const binaryString = atob(excelBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};
