const express = require("express");
const cors = require("cors");

const caseRoutes = require("./routes/caseRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    status: "VakilTrack API running"
  });
});

app.use("/api", caseRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});