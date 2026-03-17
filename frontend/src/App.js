import React from 'react';
import SchedulerWorkflow from './components/SchedulerWorkflow';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <div className="App-headerInner">
          <p className="App-eyebrow">Merlin Resort Operations</p>
          <h1>Merlin ShiftFlow</h1>
          <p className="App-lead">Build cleaner daily break plans from source files through to Excel output.</p>
          <div className="App-headerMeta">
            <span>Planner workflow</span>
            <span>Team-based setup</span>
            <span>Excel-ready output</span>
          </div>
        </div>
      </header>

      <main className="App-main">
        <SchedulerWorkflow />
      </main>

      <footer className="App-footer">
        <p>Chessington World of Adventures | Rides & Attractions Planning</p>
      </footer>
    </div>
  );
}

export default App;
