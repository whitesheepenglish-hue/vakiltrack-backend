const express = require("express");
const { exec } = require("child_process");
const app = express();

app.use(express.json());

app.post("/case-status", (req, res) => {

    const cnr = req.body.cnr;

    exec(`python scraper.py ${cnr}`, (error, stdout) => {

        if (error) {
            res.status(500).send("Error fetching case");
            return;
        }

        res.send(stdout);
    });

});

app.listen(3000, () => {
    console.log("VakilTrack Backend Running");
});