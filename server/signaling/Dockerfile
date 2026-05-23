# Minimal Deno runtime for the Markal signaling server.
# Build context: repo root.
FROM denoland/deno:debian

WORKDIR /app

COPY server/signaling/main.ts ./

# Pre-cache dependencies for faster cold starts.
RUN deno cache main.ts

ENV PORT=8080
EXPOSE 8080

# The denoland/deno image sets ENTRYPOINT to "deno",
# so CMD args are appended as `deno <args>`.
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
