# FamFin API — self-contained deploy image.
# Build context MUST be this folder (deploy/).

FROM node:20-alpine

WORKDIR /app

# Deps first (layer cache), installed inside /app/api
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci

# App source (schema.sql bootstraps the DB if needed)
COPY api/src ./api/src

ENV PORT=4000
EXPOSE 4000

WORKDIR /app/api
CMD ["npm", "start"]