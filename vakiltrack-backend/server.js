require("dotenv").config();

const express = require("express");
const cors = require("cors");

const caseRoutes = require("./routes/caseRoutes");

require("./jobs/scheduler");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/case", caseRoutes);

app.get("/", (req,res)=>{
  res.send("VakilTrack backend running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
