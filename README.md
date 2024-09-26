Steps for docker:  
Clone repository.  
Change and rename config.  
Add key files.  
docker build -t docker-node-example .  
docker run -e NODE_ENV=config -p 3000:3000 -v /home/rico/Desktop/master-project/docker-tests/results:/usr/src/app/results docker-node-example  
