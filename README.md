# Break Scheduler

**Automated Staff Assignment & Excel Planner Generation**

Modern, efficient break scheduler with horizontal time-based Excel output and beautiful drag & drop UI.

---

## 🎯 Current Highlights

✅ **Excel Planner Output** - Horizontal time-based format like old LIONS/TIGERS/ADMISSIONS  
✅ **Modern UI** - Drag & drop uploads, visual feedback, progress tracking  
✅ **Zone-Driven Day Codes** - Day codes and requirements load from the selected zone workbook  
✅ **Only 2 Files** - Skills Matrix + TimeGrip CSV  
✅ **Unit Status Selector** - Open/closed defaults loaded from zone files with manual overrides  
✅ **Professional Formatting** - Color-coded breaks, competency warnings  
✅ **Responsive Design** - Works on desktop, tablet, mobile  

---

## 📦 Installation

### Prerequisites

- **Node.js 18+** (download from https://nodejs.org/)
- **npm 9+** (comes with Node.js)

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start server
npm start
```

Backend will run on http://localhost:5000

### Frontend Setup

Open a **new terminal** window:

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

Frontend will open automatically at http://localhost:3000

---

## 🚀 Usage

### Step 1: Upload Files

Drag & drop or click to upload:

1. **Skills Matrix** (.xlsx) - Shows Green (1) training levels
2. **TimeGrip CSV** (.csv) - Staff working today (with "Function name on bars" enabled)

### Step 2: Configure

- **Team:** Select Phantom, Odyssey, or Nexus
- **Date:** Choose the schedule date
- **Day Code:** Select from A-N (auto-populated based on team)

### Step 3: Parse & Analyze

Click "Parse & Analyze Files" to:
- Read all uploaded files
- Load day code requirements from the selected zone workbook
- Calculate staffing statistics

### Step 4: Select Units

Click "Select Units to Staff" to:
- Load unit defaults from Closed Days data in the zone workbook
- Toggle individual units open/closed
- Use quick actions (reset defaults, all open, all closed)

### Step 5: Auto-Assign

Click "Auto-Assign Staff" to:
- Match staff with Green training to positions
- Enforce 3-hour competency limits
- Flag any violations
- Generate and download the Excel planner automatically

---

## 📊 Excel Planner Format

```
╔════════════════════════════════════════════════════╗
║        TEAM PHANTOM - BREAK PLANNER                ║
║ Date: Friday, 17 January 2026                      ║
║ Day Code: I - Explorer + 7PM                       ║
╠════════════════════════════════════════════════════╣
║ STAFF  │ 08:30 │ 09:00 │ 09:30 │ 10:00 │ 11:00   ║
╠────────┼───────┼───────┼───────┼───────┼─────────╣
║ Liam   │ GRUFF │ GRUFF │ MM    │ MM    │ BREAK   ║
║ Cai    │ VAMP  │ VAMP  │ VAMP  │ VAMP  │ VAMP    ║
║ Dan    │ GIFT  │ GIFT  │ GIFT  │ GRUFF │ GRUFF   ║
╚════════════════════════════════════════════════════╝
```

**Features:**
- 🟢 Green highlighting on BREAK cells
- 🟡 Orange highlighting for competency warnings
- ⚪ Clean, professional formatting
- 📊 Statistics footer
- 📋 Ready to print/distribute

---

## 🔧 Day Codes

Day codes are loaded dynamically from the selected zone workbook.

| Code | Example Name | Typical Pattern |
|------|--------------|-----------------|
| A | Lodge 4PM | Lodge-focused quieter day |
| B | Lodge 5PM | Lodge + schools pattern |
| E | Explorer 5PM | Explorer-focused day |
| I | Explorer + 7PM | Higher-demand Explorer day |
| K | WT Off-Peak | Short/quiet operating day |

Final staffing requirements can differ per zone and per selected unit set.

---

## 📁 File Structure

```
break-scheduler/
├── backend/
│   ├── data/
│   │   └── dayCodeRequirements.js
│   ├── generators/
│   │   └── excelPlannerGenerator.js
│   ├── parsers/
│   │   ├── skillsMatrixParser.js
│   │   ├── timegripParser.js
│   │   └── zoneFileParser.js
│   ├── config/
│   │   ├── constants.js
│   │   └── zoneConfig.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ModernWorkflow.jsx
│   │   │   ├── ModernWorkflow.css
│   │   │   └── modernWorkflow/
│   │   │      ├── useModernWorkflow.js
│   │   │      ├── api.js
│   │   │      ├── StepOneUploadConfig.jsx
│   │   │      ├── StepTwoReviewAnalysis.jsx
│   │   │      ├── StepThreeSelectUnits.jsx
│   │   │      ├── StepFourReviewAssignments.jsx
│   │   │      ├── StepFiveComplete.jsx
│   │   │      └── styles/
│   │   ├── App.js
│   │   ├── index.js
│   │   └── App.css
│   ├── public/
│   │   └── index.html
│   └── package.json
└── README.md
```

---

## 🎨 UI Features

### Drag & Drop Upload
- Drag files directly onto upload zones
- Instant file preview
- One-click remove

### Visual Progress
- 5-step progress bar
- Current step highlighted
- Completed steps marked green

### Statistics Cards
- Large colorful numbers
- Gradient backgrounds
- Hover animations

### Real-Time Validation
- Instant file type checking
- Clear error messages
- Helpful hints

---

## ⚡ Performance

| Metric | Legacy | Current | Improvement |
|--------|------|------|-------------|
| Files to Upload | 4 | 2 | -50% |
| Parse Time | 3-5 sec | faster (zone/day-code preloaded) | improved |
| Output Format | Word | Excel | Familiar! |
| Visual Flow | None | Clear | Game changer |

---

## 🧠 Staffing And Break Logic (Current)

This section describes the current assignment and break behavior used by the scheduler.

### Staffing model

1. Assignment is multi-pass, not single-pass.
2. Skill-gated retail units are protected first (especially Sealife and Sweet Shop), then wider host placement continues.
3. Entrances can be intentionally overstaffed in the morning, then rebalanced into retail in the afternoon.
4. Day code and open entrances drive target behavior; targets are dynamic, not a fixed global table.

### Dynamic overflow targets

Overflow targets vary based on which entrances are open for that day code.

1. Explorer + Schools open:
Explorer 4, Lodge 3, Schools 2, APGS 2, Sweet 2, Sealife 1, Supplies 1, B&J 2, B&J Kiosk 1, Lorikeets 1
2. Explorer only:
Explorer 4, Lodge 2, APGS 2, Sweet 2, Sealife 1, Supplies 1, B&J 2, B&J Kiosk 1, Lorikeets 1
3. Schools only:
Lodge 4, Schools 2, APGS 2, Sweet 2, Sealife 1, Supplies 1, B&J 2, B&J Kiosk 1, Lorikeets 1
4. Lodge-only quiet days:
Lodge 1, APGS 2, Sweet 2, Sealife 1, Lorikeets 1

Notes:

1. Azteca is treated as morning-only pre-pass support and is not part of normal overflow targeting.
2. APGS minimum fill is guarded so it does not steal hosts when Sweet Shop or Sealife have zero coverage.

### Afternoon rebalance

After lunch breaks, entrance overflow is moved to retail while preserving entrance minimums.

1. Explorer baseline days keep higher Explorer coverage.
2. Schools baseline days keep higher Schools/Lodge coverage.
3. Lodge-only days keep lower minimum entrance coverage.
4. Retail destination priority favors B&J when understaffed, then Sweet Shop, APGS, Sealife, Supplies, and other retail.

### Break slot logic

Core non-rides slots:

1. 11:00
2. 12:00
3. 13:00
4. 14:00
5. 15:00

Preferred break timing by shift pattern:

1. Early closers (home by 15:00): earliest break preference (11:00)
2. Senior Hosts: 12:00 or later (never 11:00)
3. Early starters (before 09:00): 11:00 preference
4. Mid starters (09:00 to 10:45): 12:00 preference, with cascade
5. Late starters (11:00+): 14:00 preference, cascade to 15:00 if needed

### 2-person unit staggering

Two-person units are handled with dedicated stagger logic to avoid simultaneous breaks.

1. If one person is already breaking in a slot, the second is pushed to the next safe slot.
2. This is specifically designed to avoid both people in units like Sealife and Explorer Supplies breaking together.

### Practical implications

1. You may see high entrance staffing early in day.
2. Reassignment to retail is expected after lunch windows.
3. If trained staff are unavailable for a skill-gated unit, controlled fallback can be used for continuity (except strict B&J skill rules).

---

## 🐛 Troubleshooting

### Backend won't start

```bash
# Check Node.js version
node --version  # Should be 18+

# Reinstall dependencies
cd backend
rm -rf node_modules
npm install
npm start
```

### Frontend won't start

```bash
# Check npm version
npm --version  # Should be 9+

# Reinstall dependencies
cd frontend
rm -rf node_modules
npm install
npm start
```

### Excel generation fails

```bash
# Check ExcelJS is installed
cd backend
npm list exceljs

# Reinstall if needed
npm install exceljs --save
```

### Day codes not showing

- Check backend console for errors
- Verify dayCodeRequirements.js exists in backend/data/
- Restart backend server

---

## 📝 Development

### Adding a New Day Code

Edit `backend/data/dayCodeRequirements.js`:

```javascript
'P': {
  name: 'New Day Code',
  description: 'Description here',
  positions: [
    {
      unit: 'Croc Drop',
      position: 'OP',
      staffCount: 1,
      startTime: '09:15',
      endTime: '16:45',
      breakMinutes: 45
    },
    // ... more positions
  ]
}
```

### Modifying UI Colors

Edit `frontend/src/components/ModernWorkflow.css`:

```css
/* Primary gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Change to your colors */
background: linear-gradient(135deg, #YOUR_COLOR 0%, #YOUR_COLOR 100%);
```

---

## 📚 Documentation

- **V6.5_IMPLEMENTATION_GUIDE.md** - Complete implementation details
- **V6.5_UI_PREVIEW.md** - UI mockups and features
- **DAY_CODE_QUICK_REFERENCE.md** - Day code data reference

---

## ✅ Testing Checklist

- [ ] Upload both required files successfully
- [ ] Day codes populate for selected team
- [ ] Parse & analyze completes
- [ ] Statistics display correctly
- [ ] Unit status selector loads and toggles correctly
- [ ] Auto-assign generates assignments
- [ ] Competency warnings show if applicable
- [ ] Excel file downloads
- [ ] Excel formatting looks professional
- [ ] BREAK cells highlighted green
- [ ] Can create another schedule

---

## 🎊 Credits

**Developed for:** Chessington World of Adventures  
**Department:** Rides & Attractions  
**Version:** 6.5.0  
**Release Date:** January 25, 2026  

**Features:**
- Excel planner generation (like old LIONS/TIGERS format)
- Modern drag & drop UI
- Hard-coded day codes (no upload needed)
- Real-time validation
- Professional output

---

## 📞 Support

For issues or questions:
1. Check this README
2. Review troubleshooting section
3. Check backend console logs
4. Check browser console (F12)
5. Contact IT support team

---

**Enjoy your new Break Scheduler V6.5!** 🎉
