# Break Scheduler V6.5

**Automated Staff Assignment & Excel Planner Generation**

Modern, efficient break scheduler with horizontal time-based Excel output and beautiful drag & drop UI.

---

## 🎯 What's New in V6.5

✅ **Excel Planner Output** - Horizontal time-based format like old LIONS/TIGERS/ADMISSIONS  
✅ **Modern UI** - Drag & drop uploads, visual feedback, progress tracking  
✅ **Hard-Coded Day Codes** - No more day code sheet upload (80% faster!)  
✅ **Only 3 Files** - Skills Matrix, TimeGrip CSV, Allocation Template  
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
3. **Allocation Template** (.xlsx) - Position requirements

### Step 2: Configure

- **Team:** Select Phantom, Odyssey, or Nexus
- **Date:** Choose the schedule date
- **Day Code:** Select from A-N (auto-populated based on team)

### Step 3: Parse & Analyze

Click "Parse & Analyze Files" to:
- Read all uploaded files
- Load day code requirements (hard-coded, instant!)
- Calculate staffing statistics

### Step 4: Auto-Assign

Click "Auto-Assign Staff" to:
- Match staff with Green training to positions
- Enforce 3-hour competency limits
- Flag any violations

### Step 5: Generate Excel Planner

Click "Generate Excel Planner" to:
- Create horizontal time-based Excel file
- Download immediately
- Print or email to staff!

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

## 🔧 Day Codes (Hard-Coded)

| Code | Name | Guests | Close | Positions (Phantom) |
|------|------|--------|-------|---------------------|
| A | Lodge 4PM | <3,000 | 4pm | 30 |
| B | Lodge 5PM | <3,000 | 5pm | 29 |
| E | Explorer 5PM | 4,000-8,000 | 5pm | 33 |
| I | Explorer + 7PM | 8,000-10,000 | 7pm | **37** (Peak) |
| K | WT Off-Peak | <1,750 | 3pm | 7 |

**Total:** 14 day codes (A-N) for each team

---

## 📁 File Structure

```
break-scheduler-v6.5/
├── backend/
│   ├── data/
│   │   └── dayCodeRequirements.js    Hard-coded day codes
│   ├── generators/
│   │   └── excelPlannerGenerator.js  Excel output
│   ├── parsers/
│   │   ├── skillsMatrixParser.js
│   │   ├── timegripParser.js
│   │   └── allocationParser.js
│   ├── server.js                     Main server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ModernWorkflow.jsx    Main UI component
│   │   │   └── ModernWorkflow.css    Styling
│   │   ├── App.js
│   │   ├── App.css
│   │   ├── index.js
│   │   └── index.css
│   ├── public/
│   │   └── index.html
│   └── package.json
└── README.md                          This file
```

---

## 🎨 UI Features

### Drag & Drop Upload
- Drag files directly onto upload zones
- Instant file preview
- One-click remove

### Visual Progress
- 4-step progress bar
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

| Metric | V5.0 | V6.5 | Improvement |
|--------|------|------|-------------|
| Files to Upload | 4 | 3 | -25% |
| Parse Time | 3-5 sec | <1 sec | 80% faster |
| Output Format | Word | Excel | Familiar! |
| Visual Flow | None | Clear | Game changer |

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

- [ ] Upload all 3 files successfully
- [ ] Day codes populate for selected team
- [ ] Parse & analyze completes
- [ ] Statistics display correctly
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
