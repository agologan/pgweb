# ------------------------------------------------------------------------------
# Builder Stage
# ------------------------------------------------------------------------------
FROM golang:1.22-alpine AS build

RUN apk add git make

# Set default build argument for CGO_ENABLED
ARG CGO_ENABLED=0
ENV CGO_ENABLED ${CGO_ENABLED}

WORKDIR /build

RUN git config --global --add safe.directory /build
COPY go.mod go.sum ./
RUN go mod download
COPY Makefile main.go ./
COPY static/ static/
COPY pkg/ pkg/
COPY .git/ .
RUN make build

# ------------------------------------------------------------------------------
# Release Stage
# ------------------------------------------------------------------------------
FROM alpine

RUN apk add --no-cache ca-certificates postgresql-client

COPY --from=build /build/pgweb /usr/bin/pgweb

RUN adduser -S -u 1000 pgweb
USER pgweb

EXPOSE 8081
ENTRYPOINT ["/usr/bin/pgweb", "--bind=0.0.0.0", "--listen=8081"]
