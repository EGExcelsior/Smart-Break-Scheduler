import React from 'react';
import SchedulerWorkflow from './components/SchedulerWorkflow';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>🎢 Merlin ShiftFlow</h1>
        <p>Automated Staff Assignment & Excel Planner Generation</p>
      </header>
      
      <main className="App-main">
        <SchedulerWorkflow />
      </main>
      
      <footer className="App-footer">
        <p>Chessington World of Adventures - Rides & Attractions</p>
        <p style={{fontSize: '0.8rem', opacity: 0.7}}>Merlin ShiftFlow | Excel Planner Output | Modern UI</p>
      </footer>
    </div>
  );
}

export default App;
