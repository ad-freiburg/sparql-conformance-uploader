const config = require("config");
const resultDir = config.get("pathToResultFiles");
const website = config.get("websiteAddress");
const checkName = "SPARQL 1.1 conformance check";
const checkRunningTitle = "Running SPARQL Test Suite";
const checkTitle = "SPARQL Test Suite"; // Shown in the overview the others show "Successful in 38m" 

// Set up file uploads
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs").promises; 
const bzip2 = require("./bz2.js");
const API_KEY = fs.readFileSync(config.get("severKeyPath"), "utf8");
// Set up express server
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = config.get("port");
// body parser middleware
app.use(bodyParser.json());

// GitHub App configuration
const appId = config.get("appId");
const privateKey = fs.readFileSync(config.get("githubKeyPath"), "utf8");

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

async function readFile(filePath) {
  console.log("Reading file:", filePath);
  try {
    const data = await fsPromises.readFile(filePath);
    return data;
  } catch (err) {
    console.error("Error reading the file:", err);
    throw err;
  }
}

// Functions to decompress and parse bz2 file
function decompressToString(compressedData) {
  const compressedArray = new Uint8Array(compressedData);
  try {
    // Debugging: Check the first few bytes of the compressed data
    //console.log("Compressed data header (first 10 bytes):", Array.from(compressedArray.slice(0, 10)).map(b => b.toString(16)).join(' '));
    
    const decompressedData = bzip2.simple(bzip2.array(compressedArray));
    //console.log("Successfully decompressed the file!");
    return decompressedData;
  } catch (error) {
    //console.error("Error decompressing the file:", error);
    return;
  }
}

async function decompressBz2(filePath) {
  const compressedData = await readFile(filePath);
  try {
      // Decompress the bz2 data
      const decompressedData = decompressToString(compressedData);
      const jsonData = JSON.parse(decompressedData);
      
      //console.log("Decompressed JSON Data: ", jsonData);
      return jsonData;
  } catch (error) {
      console.log("Error decompressing or parsing JSON: ", error);
      return;
  }
}

async function getCurrentMaster() {
  const filePath = path.join(__dirname, "db.json");
  var data = await readFile(filePath);
  var json = JSON.parse(data);
  return json.master;
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

function buildBodyAndSummary(comparisonData, masterCommit, latestCommit) {
  var commentBody = "";
  var summary = "";

  commentBody += `
### Overview  
| Number of Tests | Passed ✅ | Failed ❌| Intended ⚠️| Not tested |
| --------------- | --------------- | -------------- | -------------- | -------------- |
`;
  let total = comparisonData.n + comparisonData.p + comparisonData.i + comparisonData.f;
  commentBody += `| ${total} | ${comparisonData.p} | ${comparisonData.f} | ${comparisonData.i} | ${comparisonData.n} |\n`;
  if(comparisonData.isMergeable){
    commentBody += `
### Conformance check passed ✅

`;
  summary = "Conformance check passed ✅";
  } else {
    commentBody += `
### Conformance check failed ❌

`;
  summary = "Conformance check failed ❌" ;
  }

  if (comparisonData.hasChanges) {
    commentBody += generateTable(comparisonData);
  } else {
    commentBody += "\n No test result changes.\n\n"
  }
  commentBody += `Details: ${website}${masterCommit}-${latestCommit}`
  return { commentBody, summary };
}

/*
  Github App implementations 
*/
const owner = config.get("githubOwner");
const repo = "qlever";
const installationId = config.get("githubInstallationID");

async function verifyGithubAuth(octokit, installationId) {
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

async function writePRComment(octokit, prNumber, commit, commentBody) {
  // DELETE previous comment
  const { data: comments } = await octokit.issues.listComments({
    owner: owner,
    repo: repo,
    issue_number: prNumber,
  });
  
  // Find last comment by bot
  const commentByBot = comments.find(comment => 
    comment.user.login === config.get("commentAuthor")
  );

  comments.forEach(comment => {
    console.log(`Comment by ${comment.user.login}: ${comment.body}`);
    console.log(`Comment ID: ${comment.id}`);
  });
  
  if (commentByBot) {
    const commentId = commentByBot.id;
    try {
      await octokit.issues.deleteComment({
        owner: owner,
        repo: repo,
        comment_id: commentId
      });
      console.log("Comment deleted successfully.");
    } catch (error) {
      console.error("Failed to delete the comment:", error);
    }
    console.log(`Found comment by ${commentByBot.user.login} with ID: ${commentByBot}`);
  } else {
    console.log("Comment not found.");
  }
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
  } catch (error) {
    console.error(`Error creating comment for commit ${commit}:`, error);
  }
  return;
};

async function setCheckRun(octokit, owner, repo, commit, conclusion, checkSummary, checkText) {
  try {
    const checkRun = await octokit.rest.checks.create({
      owner,
      repo,
      name: checkName,
      head_sha: commit,
      status: "in_progress",
      started_at: new Date().toISOString(),
      output: {
        title: checkRunningTitle,
        summary: "The test suite is in progress...",
      },
    });
    try {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkRun.data.id,
        status: "completed",
        conclusion: conclusion,
        completed_at: new Date().toISOString(),
        output: {
          title: checkTitle,
          summary: checkSummary,
          text: checkText
        }
      });
      console.log("Check Run created");
    } catch (error) {
      console.error(`Error updating check for commit ${commit}:`, error);
    }
  } catch (error) {
    console.error(`Error creating check for commit ${commit}:`, error);
    return;
  }
}

async function triggerGithubApp(request){
  // SETUP GitHub REST-API
  const { Octokit } = await import("@octokit/rest");
  const { createAppAuth } = await import("@octokit/auth-app");
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });
  // Ensure authentication
  await verifyGithubAuth(octokit, installationId);

  const commit = request.headers["sha"];
  const event = request.headers["event"];

  const masterCommit = await getCurrentMaster();
  if (masterCommit) {
    const masterResultData = await decompressBz2(path.join(__dirname, resultDir, `${masterCommit}.json.bz2`));
    const latestResultData = await decompressBz2(path.join(__dirname, resultDir, `${commit}.json.bz2`));
    const resultData = compare(masterResultData, latestResultData);
    const { commentBody, summary } = buildBodyAndSummary(resultData, masterCommit, commit);
  
    const conclusion = resultData.isMergeable ? "success" : "failure";
    await setCheckRun(octokit, owner, repo, commit, conclusion, summary, commentBody);
  } else {
    const commentBody = "Current master was not specified.";
  }

  if (event == "pull_request") {
    const prNumber = request.headers["pr-number"];
    await writePRComment(octokit, prNumber, commit, commentBody);
  } else {
    setCurrentMaster(commit);
  }
}


// Storage handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = config.get("pathToResultFiles");
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

// File upload auth
const authenticate = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey && apiKey === API_KEY) {
    next();
  } else {
    res.status(403).send("Forbidden");
  }
};

// Endpoint to handle file upload with auth
app.post("/upload", authenticate, upload.single("file"), uploadErrorHandler, async (req, res) => {
  res.status(200).send("File uploaded successfully");
  try {
    await triggerGithubApp(req);
  } catch (error) {
    console.log("Error during handlePullRequests: " + error);
  }
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// "Graceful" shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
      console.log("HTTP server closed");
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(() => {
      console.log("HTTP server closed");
  });
});