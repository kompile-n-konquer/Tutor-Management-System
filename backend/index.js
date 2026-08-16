require("dotenv/config");
const express = require("express");
const usersRouter = require("./routes/users");

const app = express();
const PORT = 3001;

app.use(express.json());
app.use("/api/users", usersRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
