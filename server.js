const fs = require("fs");
// Set up config
const config = JSON.parse(fs.readFileSync("config/config.json", "utf8"));
const resultDir = "results";
const website = config["UIwebsiteAddress"];
const checkName = config["nameOfTheCheck"];
const checkRunningTitle = "Running SPARQL Test Suite";
const checkTitle = config["titleOfTheCheck"]; // Shown in the overview the others show "Successful in 38m" 

// Set up file uploads
const multer = require("multer");
const path = require("path");
const fsPromises = require("fs").promises; 
const bzip2 = require("./bz2.js");
const API_KEY = fs.readFileSync("./keys/" + config["severKeyFileName"], "utf8");
// Set up express server
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const port = config["port"];
// body parser middleware
app.use(bodyParser.json());

// GitHub App configuration
const appId = config["appId"];
const owner = config["githubRepositoryOwner"];
const repo = config["repositoryName"];;
const installationId = config["githubInstallationID"];
const privateKey = fs.readFileSync("./keys/" + config["githubKeyFileName"], "utf8");
let octokit = null;

// Include function to compare two test results
const compare = require("./compare");

function setCurrentMaster(sha) {
  const filePath = path.join(__dirname, "/config/", "db.json");
  const data = { "master" : sha}
  const jsonString = JSON.stringify(data, null, 2);
  fs.writeFile(filePath, jsonString, "utf8", (err) => {
      if (err) {
          console.error("Error writing file db.json:", err);
      } else {
          console.log("Successfully wrote file db.json");
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
    return null;
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
  const filePath = path.join(__dirname, "/config/", "db.json");
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
  commentBody += `Details: ${website}`
  if(masterCommit) {
    commentBody += `${latestCommit}-${masterCommit}`
  }
  return { commentBody, summary };
}

/*
  Github App implementations 
*/

async function getOctokit() {
  if(!octokit) {
    const { Octokit } = require("@octokit/rest");
    const { createAppAuth } = await import("@octokit/auth-app");
    octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId,
      },
    });
  }
  return octokit;
}

async function verifyGithubAuth(installationId) {
  try {
    // Fetch repositories accessible by the installation
    const octokit = await getOctokit();
    const response = await octokit.rest.apps.listReposAccessibleToInstallation({
      installation_id: installationId,
    });
    console.log("Authentication successful.");
    //console.log("Accessible repositories: " + response.data);
    return true;
  } catch (error) {
    console.error("Authentication failed:", error);
    return false;
  }
}

async function writePRComment(prNumber, commit, commentBody) {
  // DELETE previous comment
  const octokit = await getOctokit();
  const { data: comments } = await octokit.issues.listComments({
    owner: owner,
    repo: repo,
    issue_number: prNumber,
  });
  
  // Find last comment by bot
  const commentByBot = comments.find(comment => 
    comment.user.login === config["commentAuthor"]
  );
  
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
    console.log(`Found comment by ${commentByBot.user.login} with ID: ${commentByBot.id}`);
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

async function setCheckRun(owner, repo, commit, conclusion, checkSummary, checkText) {
  const octokit = await getOctokit();
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
  const commit = request.headers["sha"];
  const event = request.headers["event"];
  const masterCommit = await getCurrentMaster();
  const latestResultData = await decompressBz2(path.join(__dirname, resultDir, `${commit}.json.bz2`));
  var masterResultData = {};
  if (masterCommit) {
     masterResultData = await decompressBz2(path.join(__dirname, resultDir, `${masterCommit}.json.bz2`));
  }
  const resultData = compare(latestResultData, masterResultData);
  const { commentBody, summary } = buildBodyAndSummary(resultData, masterCommit, commit);
  const conclusion = resultData.isMergeable ? "success" : "failure";
  await setCheckRun(owner, repo, commit, conclusion, summary, commentBody);

  if (event == "pull_request") {
    const prNumber = request.headers["pr-number"];
    await writePRComment(prNumber, commit, commentBody);
  } else {
    setCurrentMaster(commit);
  }
}

// Function to test if upload and github authentication succeeded
async function triggerTest() {
  // Check if file was correctly uploaded
  var uploadSuccess = false;
  var status = 400;
  var message = "";
  const filePath = path.join(__dirname, "dummy/test.json");
  const data = await readFile(filePath);
  if (!data) {
    console.log("No test.json file, upload failed!");
    return;
  }
  
  const json = JSON.parse(data);
  if(json.test === "test") {
    uploadSuccess = true;
    message += "Upload was successful and ";
  } else {
    message += "Upload was NOT successful and ";
  }

  fs.unlink(filePath, (err) => {
    if (err) {
        console.log("Failed to delete:" + filePath + ": " + err);
    }
  }); 

  // Ensure authentication
  const verified = await verifyGithubAuth(installationId);
  if(verified) {
    message += "GitHub APP verification was successful!\n";
  } else {
    message += "GitHub APP verification was NOT successful!\n";
  }
  if(verified && uploadSuccess) {
    status = 200;
  }
  return {status, message};
}

// Storage handling
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadDir = "results/";
    if (req.headers["test"] && req.headers["test"] === "test") {
      uploadDir = "dummy/";
    }
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
  if (apiKey && apiKey.trim() === API_KEY.trim()) {
    next();
  } else {
    res.status(403).send("Forbidden.");
  }
};

// Endpoint to handle file upload with auth
app.post("/upload", authenticate, upload.single("file"), uploadErrorHandler, async (req, res) => {
  if (req.headers["test"] && req.headers["test"] === "test") {
    const {status, message} = await triggerTest();
    res.status(status).send(message);
  } else {
    const commit = req.headers["sha"];
    res.status(200).send("File uploaded successfully for commit: " + commit);
    try {
      await triggerGithubApp(req);
    } catch (error) {
      console.log("Error during handlePullRequests: " + error);
    }
  }
});

// Start the server
const server = app.listen(port, () => {
  console.log(`Server is running.`);
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