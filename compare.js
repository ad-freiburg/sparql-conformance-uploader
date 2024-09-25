function matchStatus(testName, status, oldStatusString, differencesBetweenResults) {
    switch (status) {
        case "Passed":
            differencesBetweenResults[`${oldStatusString}ToP`].push(testName);
            break;
        case "Failed: Intended":
            differencesBetweenResults[`${oldStatusString}ToI`].push(testName);
            break;
        case "Failed":
            differencesBetweenResults[`${oldStatusString}ToF`].push(testName);
            break;
        case "NOT TESTED":
            differencesBetweenResults[`${oldStatusString}ToN`].push(testName);
            break;
    }
}

function compare(latestResult, olderResult) {
    // Get all keys from the result objects, this includes all test names and the info part of the result file
    const allKeys = new Set([...Object.keys(latestResult), ...Object.keys(olderResult)]);
    // olderResult to latestResult. Example pToF: olderResult: Passed to latestResult: Failed
    var differencesBetweenResults = {
                                        "merge": false,
                                        "changes": false,
                                        "pToF": [],
                                        "pToI": [],
                                        "pToN": [],
                                        "fToP": [],
                                        "fToI": [],
                                        "fToN": [],
                                        "iToP": [],
                                        "iToF": [],
                                        "iToN": [],
                                        "nToP": [],
                                        "nToF": [],
                                        "nToI": [],
                                        "addedN": [],
                                        "addedI": [],
                                        "addedF": [],
                                        "addedP": [],
                                        "deleted": [],
                                        "n": 0,
                                        "p": 0,
                                        "i": 0,
                                        "f": 0
                                    };

    for (const key of allKeys) {
        if (key === "info") continue

        if (key in latestResult) {
            switch (latestResult[key]["status"]) {
                case "Passed":
                    differencesBetweenResults["p"] += 1;
                    break;
                case "Failed: Intended":
                    differencesBetweenResults["i"] += 1;
                    break;
                case "Failed":
                    differencesBetweenResults["f"] += 1;
                    break;
                case "NOT TESTED":
                    differencesBetweenResults["n"] += 1;
                    break;
            }
        }

        if (key in latestResult && key in olderResult) {
            if (latestResult[key]["status"] != olderResult[key]["status"]) {
                differencesBetweenResults.changes = true;
                switch (olderResult[key]["status"]) {
                    case "Passed":
                        matchStatus(key, latestResult[key]["status"], "p", differencesBetweenResults);
                        break;
                    case "Failed: Intended":
                        matchStatus(key, latestResult[key]["status"], "i", differencesBetweenResults);
                        break;
                    case "Failed":
                        matchStatus(key, latestResult[key]["status"], "f", differencesBetweenResults);
                        break;
                    case "NOT TESTED":
                        matchStatus(key, latestResult[key]["status"], "n", differencesBetweenResults);
                        break;
                }
            }
        } else if (key in latestResult) {
            differencesBetweenResults.changes = true;
            switch (latestResult[key]["status"]) {
                case "Passed":
                    differencesBetweenResults["addedP"].push(key);
                    break;
                case "Failed: Intended":
                    differencesBetweenResults["addedI"].push(key);
                    break;
                case "Failed":
                    differencesBetweenResults["addedF"].push(key);
                    break;
                case "NOT TESTED":
                    differencesBetweenResults["addedN"].push(key);
                    break;
            }
        } else {
            differencesBetweenResults.changes = true;
            differencesBetweenResults["deleted"].push(key);
        }
    }
    if (differencesBetweenResults["pToF"].length == 0 && differencesBetweenResults["iToF"].length == 0) {
        differencesBetweenResults["merge"] = true;
    }
    return differencesBetweenResults;
}

module.exports = compare;