require('dotenv/config');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const prisma = require('./prisma/client');
const { globalErrorHandler, notFoundErrorHandler } = require('./controllers/error');
const usersRouter = require('./routes/auth');
const allocationRouter = require('./routes/allocation');
const coursesRouter = require('./routes/courses');
const availabilityRouter = require('./routes/availability');
const onboardingRouter = require('./routes/onboarding');

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan('dev')); // Log every request to the console (Helps with debugging, can be used for development only)

// Fast root route for Azure health probes and general sanity checks.
app.get('/', (req, res) => {
  res.json({
    message: 'TutorFlow API is running',
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint that also verifies the database is reachable.
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/users', usersRouter);
app.use('/api/allocation', allocationRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/onboarding', onboardingRouter);

app.all('/{*splat}', notFoundErrorHandler); // Handle not found routes
app.use(globalErrorHandler); // Use the global error handling middleware

// Azure App Service sets PORT; SERVER_PORT is kept for backward compatibility / local dev.
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

async function startServer() {
  try {
    // Eagerly connect to the database so the first request does not pay the cold-start cost.
    await prisma.$connect();
    console.log('Database connection established');

    app.listen(PORT, () => {
      console.log(`Server started on PORT ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
}

startServer();
