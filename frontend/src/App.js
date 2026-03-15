import React from 'react';
import ModernWorkflow from './components/ModernWorkflow';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>🎢 Break Scheduler V6.5</h1>
        <p>Automated Staff Assignment & Excel Planner Generation</p>
      </header>
      
      <main className="App-main">
        <ModernWorkflow />
      </main>
      
      <footer className="App-footer">
        <p>Chessington World of Adventures - Rides & Attractions</p>
        <p style={{fontSize: '0.8rem', opacity: 0.7}}>V6.5 | Excel Planner Output | Modern UI</p>
      </footer>
    </div>
  );
}

export default App;
