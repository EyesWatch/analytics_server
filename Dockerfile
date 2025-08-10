# Dockerfile for the QuantFrame analytics server
#
# This image uses a lightweight Node.js base (Alpine) and installs only
# production dependencies.  The server reads a QuantFrame SQLite database
# from a volume and exposes an HTTP API for user and riven statistics.

FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json ./
RUN npm install --production

# Bundle app source
COPY server.js ./

# Expose the default port.  The actual port the container listens on is
# controlled by the `PORT` environment variable.  It defaults to 3000.
ENV PORT=3000
EXPOSE 3000

# Start the server
CMD [ "node", "server.js" ]