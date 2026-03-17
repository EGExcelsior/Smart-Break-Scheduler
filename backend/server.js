const express = require('express');
const path = require('path');
const fs = require('fs');

const zonesRouter = require('./routes/zones');
const analysisRouter = require('./routes/analysis');
const autoAssignRouter = require('./routes/autoAssign');

const app = express();

app.use(express.json());
app.use('/api', zonesRouter);
app.use('/api', analysisRouter);
app.use('/api', autoAssignRouter);

const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'build');
if (fs.existsSync(frontendBuildPath)) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
  console.log(`✅ Serving React frontend from ${frontendBuildPath}`);
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Break Scheduler V11.0 Backend running on port ${PORT}`);
  console.log(`📁 Zone data folder: zone-data/`);
  console.log(`🕐 Features: Competency-based breaks + Fixed slot breaks + Late arrival coverage`);
});
