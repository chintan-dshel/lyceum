# Stage 1: Build UI
FROM node:20-alpine AS build-ui
WORKDIR /ui
COPY homeuni-ui/package.json ./
RUN npm install
COPY homeuni-ui/ .
RUN npm run build

# Stage 2: API — serves both API routes and built UI static files
FROM node:20-alpine
WORKDIR /app
COPY homeuni-api/package.json ./
RUN npm install --omit=dev
COPY homeuni-api/ .
# Copy built UI into the directory Express will serve as static files
COPY --from=build-ui /ui/dist ./public
EXPOSE 3001
# Migrations run at container start against the live DATABASE_URL, not at build time
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
