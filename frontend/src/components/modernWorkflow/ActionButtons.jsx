const ActionButtons = ({
  backLabel,
  onBack,
  primaryLabel,
  primaryIcon,
  primaryLoadingLabel,
  onPrimary,
  loading,
  disabled
}) => {
  return (
    <div className="action-section">
      {onBack && (
        <button className="secondary-button" onClick={onBack}>
          {backLabel || '← Back'}
        </button>
      )}

      {onPrimary && (
        <button className="primary-button" onClick={onPrimary} disabled={disabled || loading}>
          {loading ? (
            <>
              <span className="spinner" />
              {primaryLoadingLabel}
            </>
          ) : (
            <>
              {primaryIcon && <span>{primaryIcon}</span>}
              {primaryLabel}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default ActionButtons;
