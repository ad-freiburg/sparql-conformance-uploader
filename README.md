# qlever-conformance-upload-server

GitHub App and file server to use the [qlever-conformance-tests](https://github.com/ad-freiburg/qlever-conformance-tests) seamlessly during development.

## Prerequisites

Docker or NPM.

## Setup

1. Clone this repository and the [website repository](https://github.com/SIRDNARch/qlever-conformance-website)

2. Follow the steps on the [website repository](https://github.com/SIRDNARch/qlever-conformance-website). (Note that the mounted directory should be the same as the mounted directory here.)

3. Create the GitHub App [here](https://github.com/settings/apps). Set it up how you like it.

4. Permissions needed: ***Check:*** Read & Write, ***Issues:*** Read & Write, ***Pull Requests:*** Read & Write.

5. Activate an Event, we only need it to get the installation ID.

6. Install only on this account.

7. Generate a private key, put the downloaded key into the upload-server directory and edit the config to use the key.

8. Go to install app, choose your account, select your qlever repository.

9. Get the AppId from the GitHub-App settings

10. Goto the Advanced settings, under Recent Deliveries you will see a "installation.created" click it and get the installation ID from the payload  and edit the config.

11. Create a key to make the upload of files more secure, save it in the upload-server directory and edit the config.

12. You need to set the author name (name of the bot writing the comment) in the config, the name should be the last part of the settings url + **[bot]** (example: https://github.com/settings/apps/conformance-test ***commentAuthor="conformance-test[bot]"***)

13. When you are done with the config rename it (to for example "config.json").

14. Push the workflow files to your qlever repository.

15. Create a new Action Secret for the server key you created, called SERVER_KEY.

16. Create a new Action Secret for the server url you will use, called SERVER_URL.

17. Either you setup the first result file yourself or you do a commit to the master/main branch, after that everything should work.


## Starting the server

### Using Docker

```
docker build -t sparql-conformance-uploader . 
```


```
docker run --name sparql-conformance-uploader -d -p PORT:3000 -v your_path:/results sparql-conformance-uploader
```

Explanation:

The server will be reachable on the port 3000 of your machine.

```
-v /Users/username/Desktop/project/results:/usr/src/app/results
```

This mounts your directory (which is the first path, do ***not*** change the second path) to the results directory used by the server.

Set it to the directory containing the result files, which you already used for the website server.


Set the NODE_ENV to the name you used for the config (In this example I renamed it to config).



### Using NPM
  
```
npm install
```
  
```
node server.js
```

This will make the server reachable at http://localhost:3000/  
