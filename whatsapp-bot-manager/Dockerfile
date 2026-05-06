FROM node:18-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Set npm registry to a faster mirror and disable audit
RUN npm config set registry https://registry.npmmirror.com/ && \
    npm config set audit false && \
    npm config set fund false

# Install dependencies with optimizations
RUN npm ci --production --no-optional

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "start"]
