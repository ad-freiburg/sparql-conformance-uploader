# qlever-conformance-upload-server

GitHub App and file server to use the [qlever-conformance-tests](https://github.com/ad-freiburg/qlever-conformance-tests) seamlessly during development.

## Prerequisites

Docker, Docker-compose.

## Setup

1. Clone this repository and the [website repository](https://github.com/SIRDNARch/qlever-conformance-website)

2. Follow the steps on the [website repository](https://github.com/SIRDNARch/qlever-conformance-website). (Note that the mounted directory should be the same as the mounted directory here.)

3. Create the GitHub App. Explained [here](#creating-the-github-app).

3. Make the upload secure. Explained [here](#create-a-key-for-the-file-upload).

3. Fill in the config. Explained [here](#setting-up-the-config-file).

3. Setup the GitHub workflows. Explained [here](#set-up-github-workflow).

4. Configure the docker-compose file. Explained [here](#configure-docker-compose).

5. Start docker-compose [here](#start-docker-compose). 

## Creating the GitHub App
1. Create the GitHub App [here](https://github.com/settings/apps).

2. Homepage URL and the Webhook URL (Do not disable Events) can be placeholders (for example http://qlever.cs.uni-freiburg.de)

2. Permissions needed: ***Checks:*** Read & Write, ***Pull Requests:*** Read & Write.

3. You can set up all other options how you like.

6. When you are done press Install Only on this account.

7. Generate a private key and save the downloaded key somewhere, so we can use it later.

8. On the left side click on Install App and find your account press install.

9. Select your repository and press install.

10. That is it, you created the GitHub App, we will need it later to fill in the config.


## Create a key for the file upload
1. Generate a secure key.
1. Create a server-key.pem file containing the key, which we will use for the file upload.
1. We will need this key later when we setup our GitHub workflows.

## Setting up the config file
1. ***severKeyFileName***: Set it to the name of the file containing your generated key.
2. ***githubKeyFileName***: Set it to the name of the file containing the private key for the GitHub App.
3. ***repositoryName***: Set it to the name of the repository you want to work with. (usually qlever)
4. ***githubRepositoryOwner***: Set it to the name of the owner of the repository.
5.  ***githubInstallationID***: Set it to the GitHub installation ID of you repository. I explain below how to find it.
6.  ***appId***: Set it to the GitHub App ID. You can find it in the General App settings([here](https://github.com/settings/apps)).
7.  ***commentAuthor***: Set it to the name of your app + "[bot]" (more information below).
8.   ***UIwebsiteAddress***: Set it to the address of the UI website which will visualize the results.
9.  ***nameOfTheCheck***: Set it to the name you want the Check to have.

### How to find the installation ID
Open the GitHub App settings ([here](https://github.com/settings/apps)), on the left click on the Advanced, under Recent Deliveries you will see a "installation.created" click it and get the installation ID from the payload (4th row of the payload).

### How to set the commentAuthor correctly
When you are in the general app settings ([here](https://github.com/settings/apps)) of your app the url should include the name of your app, copy it and add ***[bot]*** to the end so for example: https://github.com/settings/apps/conformance-test would be "conformance-test[bot]"

## Set up GitHub workflow
1. Upload the two workflows into your respositories .github/workflows directory.
2. Go to your repository settings, go to **Secrets and variables** and **Actions**.
2. Create a new **repository secret** and call it CONFORMANCE_UPLOAD_SERVER_URL, in the secret should be the address of the upload server.
2. Create a new **repository secret** and call it CONFORMANCE_UPLOAD_SERVER_KEY, in the secret should be the key you created for the upload server.
2. Thats it for the GitHub workflow.

## Configure docker compose
1. Set the port, to a port accessible from the outside.
2. Set the first PATH to the path containing the conformance result files. (The same should be mounted to the website server).
1. Create a directory for the two keys (GitHub App and Upload Server) and put both .pem files there.
1. Set the second PATH to the path of the folder you just created containing the two key files.
1. Set the third PATH to the path of the directory containing the config.json and the db.json, if you didn't move it, it should be in the same directory as the docker-compose.yml.

## Start docker compose
Go to the directory containing the docker-compose.yml.

If you run it for the first time use to build the image.
```
docker-compose up --build -d
```

If you have already build the image just use.

```
docker-compose up -d
```

You can remove the ***-d*** if you do not want to start it in the detached mode.

To ***shut down*** use

```
docker-compose down
```

Use this to access the interactive shell of the docker container:

```
docker-compose exec app /bin/sh
```

