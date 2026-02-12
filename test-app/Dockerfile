FROM node:20-alpine

# Install SDK first (dependency of test-app)
WORKDIR /sdk
COPY sdk/package*.json ./
RUN npm install
COPY sdk/ ./

# Setup test-app
WORKDIR /app
COPY test-app/package*.json ./
RUN npm install

# Copy test-app source code
COPY test-app/ ./

# Expose port
EXPOSE 4000

# Start service
CMD ["npm", "run", "dev"]
