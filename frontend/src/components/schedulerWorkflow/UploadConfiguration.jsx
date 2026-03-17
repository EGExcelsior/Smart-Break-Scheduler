import ActionButtons from './ActionButtons';
import FileUploadCard from './FileUploadCard';
import { FILE_CONFIG, TEAM_OPTIONS } from './config';

const UploadConfiguration = ({
  files,
  teamName,
  zone,
  date,
  dayCode,
  dayCodeOptions,
  loading,
  canProceed,
  onFileSelect,
  onFileDrop,
  onDragOver,
  onRemoveFile,
  onTeamChange,
  onDateChange,
  onDayCodeChange,
  onParseAnalyze
}) => {
  return (
    <div className="step-content">
      <h2 className="step-title">Step 1: Upload Files & Configure</h2>

      <div className="upload-cards">
        {Object.entries(FILE_CONFIG).map(([fileType, config]) => (
          <FileUploadCard
            key={fileType}
            id={fileType}
            title={config.title}
            required={config.required}
            icon={config.icon}
            hint={config.hint}
            accept={config.accept}
            file={files[fileType]}
            onSelect={onFileSelect(fileType)}
            onDrop={onFileDrop(fileType)}
            onDragOver={onDragOver}
            onRemove={() => onRemoveFile(fileType)}
          />
        ))}
      </div>

      <div className="config-section">
        <h3>Configuration</h3>

        <div className="config-grid">
          <div className="form-group">
            <label htmlFor="team">Select Team</label>
            <select id="team" value={teamName} onChange={(event) => onTeamChange(event.target.value)} className="form-select">
              <option value="">-- Select Team --</option>
              {TEAM_OPTIONS.map((team) => (
                <option key={team.value} value={team.value}>
                  {team.label}
                </option>
              ))}
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
            <input type="date" id="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="form-input" />
          </div>

          <div className="form-group">
            <label htmlFor="dayCode">Day Code</label>
            <select
              id="dayCode"
              value={dayCode}
              onChange={(event) => onDayCodeChange(event.target.value)}
              className="form-select"
              disabled={!zone || dayCodeOptions.length === 0}
            >
              <option value="">-- Select Day Code --</option>
              {dayCodeOptions.map((dayCodeOption) => (
                <option key={dayCodeOption.code} value={dayCodeOption.code}>
                  {dayCodeOption.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {dayCodeOptions.length === 0 && zone && <p className="info-text">Loading day codes for {zone.replace(/_/g, ' ')}...</p>}
      </div>

      <ActionButtons
        primaryLabel="Parse & Analyze Files"
        primaryIcon="🔍"
        primaryLoadingLabel="Analyzing..."
        onPrimary={onParseAnalyze}
        loading={loading}
        disabled={!canProceed}
      />
    </div>
  );
};

export default UploadConfiguration;
