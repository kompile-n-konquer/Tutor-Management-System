require('dotenv/config');
const express = require('express');
const usersRouter = require('./routes/users');

const app = express();

app.use(express.json());
app.use('/api/users', usersRouter);

const PORT = process.env.SERVER_PORT;
app.listen(PORT, () => {
  console.log(`Server started on PORT ${PORT}`);
});
