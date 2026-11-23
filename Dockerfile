FROM alpine:3.24.4@sha256:f59abe656b692d901e184be3445e084786602108599d2a51d229c0f5a48c71bf AS builder

COPY ./dist /dist

# Compress assets to work with nginx-gzip-static-module
WORKDIR /dist/assets
RUN gzip -k ../index.html *.js *.map *.css *.wasm *-app-*.json 

FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7

# Patch fixable HIGH CVEs in Alpine packages until the pinned base image
# ships them: CVE-2026-45447 (libcrypto3/libssl3), CVE-2026-40200
# (musl/musl-utils), CVE-2026-22184 (zlib), CVE-2026-86145, CVE-2026-89157,
# CVE-2026-89161 and CVE-2026-103111 (pcre2).
USER root
RUN apk upgrade --no-cache libcrypto3 libssl3 musl musl-utils zlib pcre2
USER 101

COPY --from=builder ./dist /app

COPY config/nginx.conf /etc/nginx/conf.d/default.conf
