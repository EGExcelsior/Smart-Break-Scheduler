const FileUploadCard = ({
  id,
  title,
  required,
  icon,
  hint,
  accept,
  file,
  onSelect,
  onDrop,
  onDragOver,
  onRemove
}) => {
  const statusLabel = file ? 'Ready' : required ? 'Required' : 'Optional';
  const statusClassName = file ? 'required-badge required-badge--ready' : 'required-badge';

  return (
    <div className="upload-card">
      <div className="card-header">
        <h3>{title}</h3>
        <span className={statusClassName}>{statusLabel}</span>
      </div>
      <div className={`upload-zone ${file ? 'has-file' : ''}`} onDrop={onDrop} onDragOver={onDragOver}>
        {file ? (
          <div className="file-preview">
            <span className="file-icon">{icon}</span>
            <span className="file-name">{file.name}</span>
            <button className="remove-btn" onClick={onRemove}>×</button>
          </div>
        ) : (
          <div className="upload-prompt">
            <span className="upload-icon">{icon}</span>
            <p>Drop file here or browse from your device</p>
            <p className="upload-hint">{hint}</p>
            <input type="file" accept={accept} onChange={onSelect} style={{ display: 'none' }} id={id} />
            <label htmlFor={id} className="upload-button">Choose File</label>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadCard;
