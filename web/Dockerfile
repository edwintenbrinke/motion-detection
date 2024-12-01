# Use an official Node.js image as the base
FROM node:22

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json (or yarn.lock) files to the container
COPY package*.json ./

# Clear npm cache and remove node_modules to ensure clean install
RUN npm cache clean --force

# Install dependencies with forced reinstall
RUN npm install --force

# Copy the rest of the application code to the container
COPY . .

# Rebuild optional dependencies
RUN npm rebuild

# Build the Vuetify project
RUN npm run build

# Expose port 3000 for the application
EXPOSE 3000

# Command to start the application
CMD ["npm", "run", "dev", "--host", "0.0.0.0"]
