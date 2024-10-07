# qlever-conformance-upload-server

GitHub App and file server to use the [qlever-conformance-tests](https://github.com/ad-freiburg/qlever-conformance-tests) seamlessly during development.

## Prerequisites

Docker or NPM.

## Setup

1. Clone this repository and the [website repository](https://github.com/SIRDNARch/qlever-conformance-website)

2. Follow the steps on the [website repository](https://github.com/SIRDNARch/qlever-conformance-website). (Note that the mounted directory should be the same as the mounted directory here.)

3. Create the GitHub App [here](https://github.com/settings/apps). Set it up how you like it.

4. Permissions needed: **Check:** Read & Write, **Issues:** Read & Write, **Pull Requests:** Read & Write.

5. Activate an Event, we only need it to get the installation ID.

6. Use **"only installed on this account"** and select your qlever repository.

7. Generate a private key, put the downloaded key into the upload-server directory and edit the config to use the key.

8. Get the installation ID and the AppId from the GitHub-App settings and edit the config.

9. Create a key to make the upload of files more secure, save it in the upload-server directory and edit the config.

10. When you are done with the config rename it (to for example config).

11. Push the workflow files to your qlever repository.

12. Create a new Action Secret for the server key you created, called SERVER_KEY.

13. Create a new Action Secret for the server url you will use, called SERVER_URL.


## Starting the server

### Using Docker

```
docker build -t conformance-app . 
```


```
docker run -e NODE_ENV=config -p 3000:3000 -v /home/user/Desktop/docker-tests/results:/usr/src/app/results conformance-app
```

Explanation:

The server will be reachable on the port 3000 of your machine.

```
-v /Users/username/Desktop/project/results:/usr/src/app/results
```

This mounts your directory (which is the first path, do not change the second path) to the results directory used by the server.

Set it to the directory containing the result files, which you already used for the website server.


Set the NODE_ENV to the name you used for the config (Here I renamed it to config).



### Using NPM
  
```
npm install
```
  
```
node server.js
```

This will make the server reachable at http://localhost:3000/  
