# Zero sync server Dockerfile
FROM registry.hub.docker.com/rocicorp/zero:latest

# Zero runs on port 4848 by default
EXPOSE 4848

# The base image already has the zero-cache binary
# We just need to pass the right environment variables
CMD ["zero-cache"]
