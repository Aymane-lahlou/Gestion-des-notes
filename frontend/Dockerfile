FROM node:20-alpine AS build

WORKDIR /app

# Build context is project root in docker-compose.prod.yml.
# Copy frontend dependency manifests explicitly so npm ci can use package-lock.json.
COPY frontend/package*.json /app/
RUN npm ci

COPY frontend/ /app

ARG VITE_API_BASE_URL=http://localhost:8001/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist /app/dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
