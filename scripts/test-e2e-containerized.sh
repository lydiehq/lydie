#!/bin/bash

# E2E Test Orchestration Script for Containerized Environment
# This script manages the full lifecycle of containerized E2E tests

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.e2e.yml"
PROJECT_NAME="lydie-e2e"
TIMEOUT=300  # 5 minutes timeout for services to be ready

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

log_success() {
    echo -e "${GREEN}✓ ${NC}$1"
}

log_warning() {
    echo -e "${YELLOW}⚠ ${NC}$1"
}

log_error() {
    echo -e "${RED}✗ ${NC}$1"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    log_info "Cleaning up containers..."
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans || true
    
    if [ $exit_code -eq 0 ]; then
        log_success "E2E tests completed successfully!"
    else
        log_error "E2E tests failed with exit code $exit_code"
    fi
    
    exit $exit_code
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Main script
main() {
    log_info "Starting containerized E2E test suite..."
    
    # Check if Docker is running
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    
    # Check if docker-compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    # Step 1: Clean up any existing containers
    log_info "Cleaning up any existing containers..."
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans || true
    
    # Step 2: Build images
    log_info "Building Docker images..."
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build --no-cache
    log_success "Docker images built successfully"
    
    # Step 3: Start services
    log_info "Starting services..."
    docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d postgres backend zero web
    
    # Step 4: Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    
    wait_for_service() {
        local service=$1
        local max_attempts=60
        local attempt=0
        
        while [ $attempt -lt $max_attempts ]; do
            if docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps "$service" | grep -q "healthy"; then
                log_success "$service is healthy"
                return 0
            fi
            
            if docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps "$service" | grep -q "unhealthy"; then
                log_error "$service is unhealthy"
                docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs "$service"
                return 1
            fi
            
            attempt=$((attempt + 1))
            echo -n "."
            sleep 2
        done
        
        log_error "$service did not become healthy in time"
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs "$service"
        return 1
    }
    
    wait_for_service "postgres"
    wait_for_service "zero"
    wait_for_service "backend"
    wait_for_service "web"
    
    log_success "All services are healthy"
    
    # Step 5: Set up database schema
    log_info "Setting up database schema..."
    
    # Use drizzle-kit to push schema
    export POSTGRES_CONNECTION_STRING_DIRECT="postgresql://postgres:postgres_test_password@localhost:5432/lydie_test"
    
    if command -v bun &> /dev/null; then
        cd packages/database
        bun run drizzle-kit push --config drizzle.config.ts || {
            log_warning "Drizzle push failed, attempting with setup script..."
            cd ../scripts
            bun run src/setup-test-db.ts
            cd ../..
        }
        cd ../..
    else
        log_warning "Bun not found, skipping schema setup. Make sure database is initialized."
    fi
    
    log_success "Database schema setup complete"
    
    # Step 6: Show service URLs
    log_info "Services are running at:"
    echo "  - Frontend: http://localhost:3000"
    echo "  - Backend:  http://localhost:3001"
    echo "  - Zero:     http://localhost:4848"
    echo "  - Database: postgresql://postgres:postgres_test_password@localhost:5432/lydie_test"
    
    # Step 7: Run tests
    log_info "Running Playwright E2E tests..."
    
    # Export environment variables for tests
    export BASE_URL="http://localhost:3000"
    export POSTGRES_CONNECTION_STRING_POOLED="postgresql://postgres:postgres_test_password@localhost:5432/lydie_test"
    export POSTGRES_CONNECTION_STRING_DIRECT="postgresql://postgres:postgres_test_password@localhost:5432/lydie_test"
    export BETTER_AUTH_SECRET="test-secret-key-for-e2e-testing-only"
    
    # Run tests directly (not in container for better debugging)
    cd packages/web
    
    if [ "$1" = "--ui" ]; then
        log_info "Running tests in UI mode..."
        bun run playwright test --ui
    elif [ "$1" = "--debug" ]; then
        log_info "Running tests in debug mode..."
        bun run playwright test --debug
    else
        bun run playwright test
    fi
    
    local test_exit_code=$?
    
    cd ../..
    
    if [ $test_exit_code -eq 0 ]; then
        log_success "All tests passed!"
    else
        log_error "Tests failed with exit code $test_exit_code"
        
        # Show service logs for debugging
        log_info "Showing service logs for debugging..."
        docker-compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs --tail=50
    fi
    
    return $test_exit_code
}

# Run main function
main "$@"

