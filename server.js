// Set up file uploads
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const API_KEY = fs.readFileSync("../api-key.pem", "utf8");

// Set up express server
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = 3001;
// body parser middleware
app.use(bodyParser.json());

// GitHub App configuration
const appId = 907649; // TODO: maybe hide?
const privateKey = fs.readFileSync("../key.pem", "utf8");

// Include function to compare two test results
const compare = require("./compare");

function setCurrentMaster(sha) {
  const filePath = path.join(__dirname, "db.json");
  const data = { "master" : sha}
  const jsonString = JSON.stringify(data, null, 2);
  fs.writeFile(filePath, jsonString, "utf8", (err) => {
      if (err) {
          console.error("Error writing file:", err);
      } else {
          console.log("Successfully wrote file");
      }
  });
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, "utf8", (err, jsonString) => {
        if (err) {
            reject("Error reading file: " + err);
            return;
        }
        try {
            const data = JSON.parse(jsonString);
            resolve(data);
        } catch (err) {
            reject("Error parsing JSON string: " + err);
        }
    });
  });
}

async function getCurrentMaster() {
  const filePath = path.join(__dirname, "db.json");
  var data = await readFile(filePath);
  return data.master;
}

function generateTable(results) {
  const passed = "Passed";
  const failed = "Failed";
  const intended = "Intended";
  const notTested = "Not Tested";
  const deleted = "Deleted";

  const statusMap = {
      "pToF": [passed, failed],
      "pToI": [passed, intended],
      "pToN": [passed, notTested],
      "fToP": [failed, passed],
      "fToI": [failed, intended],
      "fToN": [failed, notTested],
      "iToP": [intended, passed],
      "iToF": [intended, failed],
      "iToN": [intended, notTested],
      "nToP": [notTested, passed],
      "nToF": [notTested, failed],
      "nToI": [notTested, intended],
      "addedN": ["-", notTested],
      "addedP": ["-", passed],
      "addedI": ["-", intended],
      "addedF": ["-", failed],
      "deleted": [deleted, "-"]
  };

  let table = `
#### Test Status Changes 📊

| Number of Tests | Previous Status | Current Status |
| --------------- | --------------- | -------------- |
`;
  for (const [key, value] of Object.entries(results)) {
    if(value.length > 0) {
      const [prevStatus, currentStatus] = statusMap[key];
      let count = value.length;
      table += `| ${count} | ${prevStatus} | ${currentStatus} |\n`;
    }
  }
  return table += "\n";
}

function buildBodyAndDescription(comparisonData) {
  var commentBody = "";
  var desc = "";
  if (false) {
    console.log("Result file not found:", comparisonData.file);
    desc = "Error: File not found";
    commentBody = `Could not find file for commit ${comparisonData.file}`;
  }
  else {
    commentBody += `
| Number of Tests | Passed ✅ | Failed ❌| Intended ⚠️| Not tested |
| --------------- | --------------- | -------------- | -------------- | -------------- |
`;
    let total = comparisonData.n + comparisonData.p + comparisonData.i + comparisonData.f;
    commentBody += `| ${total} | ${comparisonData.p} | ${comparisonData.f} | ${comparisonData.i} | ${comparisonData.n} |\n`;
    if(comparisonData.merge){
      commentBody += `
### Conformance check passed ✅

`;
      desc = "Conformance check passed ✅";
    } else {
      commentBody += `
### Conformance check failed ❌

`;
      desc = "Conformance check failed ❌" ;
    }
    if (comparisonData.changes) {
      commentBody += generateTable(comparisonData);
    } else {
      commentBody += "\n No test result changes.\n\n"
    }
  }
  return { commentBody, desc };
}

async function verifyAuth(octokit, installationId) {
  try {
    // Fetch repositories accessible by the installation
    const response = await octokit.rest.apps.listReposAccessibleToInstallation({
      installation_id: installationId,
    });
    console.log("Authentication successful.");
    //console.log("Accessible repositories: " + response.data);
  } catch (error) {
    console.error("Authentication failed:", error);
  }
}


// File upload auth
const authenticate = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey && apiKey === API_KEY) {
    next();
  } else {
    res.status(403).send("Forbidden");
  }
};

// Handle PR
async function handlePullRequests(req, res) {
  // Setup GITHUB REST-API
  const { Octokit } = await import("@octokit/rest");
  const { createAppAuth } = await import("@octokit/auth-app");
  const owner = "SIRDNARch"
  // Authenticate as installation
  const installationId = 51270317;
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });

  await verifyAuth(octokit, installationId);

  const latestCommit = req.headers["sha"];
  console.log("New Commit SHA:", latestCommit);
  
  const masterCommit = await getCurrentMaster();
  console.log("Master SHA:", masterCommit);

  // Compare results of the conformance test suitew of the master and new commit
  // TODO: Add try catch with error messages
  var masterResultData = await readFile(path.join(__dirname, "website", "public", "results", `${masterCommit}.json`));
  var latestResultData = await readFile(path.join(__dirname, "website", "public", "results", `${latestCommit}.json`));
  var resultData = compare(masterResultData, latestResultData);

  const event = req.headers["event"];
  if (event == "pull_request") {
    const prNumber = req.headers["pr-number"];
    const repo = "qlever";
    var { commentBody, desc } = buildBodyAndDescription(resultData);
    
    const website = "http://localhost:3000/";
    commentBody += `Details: ${website}${masterCommit}-${masterCommit}`;

    // Create status check
    try {
      await octokit.repos.createCommitStatus({
        owner,
        repo,
        sha: latestCommit,
        state: resultData.merge ? "success" : "failure",
        context: "SPARQL Test Suite",
        description: desc,
      });
    } catch (error) {
      console.error("Error handling commit:", error);
    }
    // Post comment on the pull request
    try {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
    } catch (error) {
      console.error("Error handling comment:", error);
    }
  } else {
    if (resultData.merge) {
      setCurrentMaster(latestCommit);
    }
  }
  return;
};

// Storage handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = "website/public/results/";
    if (!fs.existsSync(uploadDir)){
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

// Set up multer for handling file uploads
const upload = multer({ storage: storage });

// Error handling if the file upload fails
function uploadErrorHandler(err, req, res, next) {
  if (err) {
    console.log("File upload error: " + err.message);
    res.status(400).send("File upload error: " + err.message);
  } else {
    next();
  }
}

// Endpoint to handle file upload with auth
app.post("/upload", authenticate, upload.single("file"), uploadErrorHandler, async (req, res) => {
  res.status(200).send("File uploaded successfully");
  try {
    await handlePullRequests(req, res);
  } catch (error) {
    console.log("Error during handlePullRequests: " + error);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
