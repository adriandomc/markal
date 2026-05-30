FROM mcr.microsoft.com/playwright:v1.60.0-jammy

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl unzip ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | sh -s -- -y
ENV DENO_INSTALL=/root/.deno
ENV PATH=$DENO_INSTALL/bin:$PATH

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY deno.json deno.lock package.json ./
COPY astro.config.mjs tsconfig.json server.mjs ./
COPY src ./src
COPY public ./public

RUN deno install --allow-scripts
RUN deno task build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

CMD ["deno", "task", "start"]
