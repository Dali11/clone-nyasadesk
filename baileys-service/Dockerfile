FROM node:20-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends git && apt-get clean

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/auth_state

EXPOSE 3000

CMD ["npm", "start"]
