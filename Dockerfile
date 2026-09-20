FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001 3002 3003

CMD ["npx", "tsx", "src/index.ts"]