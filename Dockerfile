FROM node:24-alpine
WORKDIR /app
RUN corepack enable && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
COPY . .
RUN yarn

CMD ["bash"]
