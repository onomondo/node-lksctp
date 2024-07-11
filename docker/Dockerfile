FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y libsctp-dev curl xz-utils python3 make g++

RUN useradd -ms /bin/bash dev
USER dev

RUN mkdir /home/dev/app
COPY --chown=dev:dev . /home/dev/app/

WORKDIR /home/dev
RUN curl -o node.tar.xz https://nodejs.org/dist/v16.20.2/node-v16.20.2-linux-x64.tar.xz
RUN tar -xf node.tar.xz && rm node.tar.xz && mv node-* node
ENV PATH="/home/dev/node/bin:$PATH"

WORKDIR /home/dev/app
RUN npm install
