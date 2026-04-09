const JSON_HEADERS = { 'Content-Type': 'application/json' };

const parseJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  if (isJson) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();
  const looksLikeHtml = trimmedBody.startsWith('<!DOCTYPE html') || trimmedBody.startsWith('<html');
  const serverHint = looksLikeHtml
    ? 'Received HTML instead of JSON. Check that the backend API is running and the request URL/proxy is correct.'
    : 'Received non-JSON response from server.';

  const detail = trimmedBody
    ? ` Response starts with: ${trimmedBody.slice(0, 120).replace(/\s+/g, ' ')}`
    : '';

  throw new Error(`${serverHint} [${response.status} ${response.statusText}] ${response.url}.${detail}`);
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

export const fetchApiHealth = async () => {
  const response = await fetch('/api/health', {
    method: 'GET',
    cache: 'no-store'
  });

  return parseJsonResponse(response);
};

export const fetchDayCodesForZone = async (zone) => {
  return postJson('/api/day-codes-for-zone', { zone });
};

export const fetchUnitStatus = async ({ teamName, zone, date, dayCode }) => {
  return postJson('/api/get-unit-status', { teamName, zone, date, dayCode });
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
