FROM node:24-trixie-slim

RUN apt-get update && apt-get install -y libsctp-dev python3 make g++ valgrind

USER node
WORKDIR /home/node/app
COPY --chown=node:node . .

RUN npm ci
