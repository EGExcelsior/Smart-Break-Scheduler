const ErrorMessage = ({ error, onDismiss }) => {
  if (!error) {
    return null;
  }

  return (
    <div className="error-message">
      <span>❌</span>
      <p>{error}</p>
      <button onClick={onDismiss}>×</button>
    </div>
  );
};

export default ErrorMessage;
