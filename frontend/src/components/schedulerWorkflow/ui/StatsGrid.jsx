const StatsGrid = ({ stats }) => {
  return (
    <div className="stats-grid">
      {stats.map((stat) => (
        <div key={stat.label} className={`stat-card ${stat.variant || ''}`.trim()}>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
};

export default StatsGrid;
