FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
RUN node src/db/migrate.js || true
EXPOSE 3001
CMD ["node", "src/index.js"]
