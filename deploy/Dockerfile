# FamFin API — self-contained deploy image.
# The image mirrors this folder's layout so the relative import in
# api/src/routes/receipt.js (../../../family-cashflow/src/services/local/receiptParser.js)
# resolves inside the container: /app/api/src/routes -> /app/family-cashflow/...
#
# Build context MUST be this folder (deploy/).

FROM node:20-alpine

WORKDIR /app

# Deps first (layer cache), installed inside /app/api
COPY api/package.json api/package-lock.json ./api/
RUN cd api && npm ci

# App source
COPY api/src ./api/src

# The one cross-monorepo import, mirrored as a sibling of api/
COPY family-cashflow/src/services/local/receiptParser.js ./family-cashflow/src/services/local/receiptParser.js

ENV PORT=4000
EXPOSE 4000

WORKDIR /app/api
CMD ["npm", "start"]