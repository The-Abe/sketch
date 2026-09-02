FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=build /app/dist ./dist
COPY server.js ./
COPY band-genres.json ./
EXPOSE 4098
CMD ["node", "server.js"]
