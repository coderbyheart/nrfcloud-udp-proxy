FROM node:latest
ARG GITHUB_TOKEN
ENV DATA_DIR
RUN mkdir -p /src/app
WORKDIR /src/app
COPY ./src /src/app/src
COPY ./package*.json /src/app/
COPY ./.npmrc /src/app/
COPY ./tsconfig.json /src/app/
RUN echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" > ~/.npmrc
RUN npm ci
RUN npx tsc
RUN npm i -g forever
EXPOSE 8888