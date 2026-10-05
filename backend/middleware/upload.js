const multer = require('multer');
const path = require('path');

// Store uploaded files in the backend/uploads directory with a timestamped name
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_');
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

const acceptPdfOnly = (_req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'));
  }
};

// Only accept PDF files up to 10 MB
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: acceptPdfOnly,
});

// Timetable PDFs are plain single-page grids, so 500 KB is a generous ceiling
const timetableUpload = multer({
  storage,
  limits: { fileSize: 500 * 1024 },
  fileFilter: acceptPdfOnly,
});

module.exports = upload;
module.exports.timetableUpload = timetableUpload;
