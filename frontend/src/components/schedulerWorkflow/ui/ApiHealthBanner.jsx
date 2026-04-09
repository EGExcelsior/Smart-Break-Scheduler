const ApiHealthBanner = ({ apiHealth, onRetry }) => {
  if (!apiHealth?.checked || apiHealth.healthy) {
    return null;
  }

  return (
    <div className="api-health-banner" role="status" aria-live="polite">
      <div className="api-health-banner__content">
        <span className="api-health-banner__icon">⚠️</span>
        <div>
          <p className="api-health-banner__title">Backend API unavailable</p>
          <p className="api-health-banner__message">
            {apiHealth.message || 'Could not connect to backend. Requests may fail until service is available.'}
          </p>
        </div>
      </div>
      <button type="button" className="api-health-banner__retry" onClick={onRetry}>
        Retry Connection
      </button>
    </div>
  );
};

export default ApiHealthBanner;
