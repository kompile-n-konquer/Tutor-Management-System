require('dotenv/config');
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { globalErrorHandler, notFoundErrorHandler } = require('./controllers/error');
const usersRouter = require('./routes/auth');

const app = express();

app.use(express.json());
app.use(cors());
app.use(morgan('dev')); // Log every request to the console (Helps with debugging, can be used for development only)

app.use('/api/users', usersRouter);

app.all('/{*splat}', notFoundErrorHandler); // Handle not found routes
app.use(globalErrorHandler); // Use the global error handling middleware

// Azure App Service sets PORT; SERVER_PORT is kept for backward compatibility / local dev.
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on PORT ${PORT}`);
});
