# syntax=docker/dockerfile:1
#
# Multi-stage build: compile the fat jar in a JDK image, then run it on a
# slim JRE base. Final image is ~220MB vs ~520MB for a single-stage JDK
# image, with no Gradle cache leaking in.
#
# Render's build runs `docker build` from the repo root set to `server/`
# (configure "Root Directory" = server in the Render dashboard), so all
# paths below are relative to server/.

# ── Stage 1: build ────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk AS build
WORKDIR /workspace

# Copy Gradle wrapper + config first so layer cache survives source changes.
# If only src/ changes, the dependency resolution layer is reused.
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew \
 && ./gradlew --version \
 && ./gradlew dependencies --no-daemon -q || true

COPY src src
RUN ./gradlew bootJar --no-daemon -x test

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app

# Unprivileged user — don't run Java as root in a container.
RUN useradd --system --home /app --shell /usr/sbin/nologin maxpos
USER maxpos

COPY --from=build --chown=maxpos:maxpos /workspace/build/libs/*.jar /app/app.jar

# Documentation only; Render wires the real port dynamically via PORT.
EXPOSE 8080

# MaxRAMPercentage lets the JVM size its heap against the container memory
# limit rather than the host's, which matters on small Render plans.
ENTRYPOINT ["java","-XX:MaxRAMPercentage=75","-jar","/app/app.jar"]
