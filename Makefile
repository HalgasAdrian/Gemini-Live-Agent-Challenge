.PHONY: dev dev-backend dev-frontend install docker-up docker-down clean

install: ## Install all dependencies
	cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

dev: ## Start both backend and frontend
	@echo "Starting backend and frontend..."
	@make -j2 dev-backend dev-frontend

dev-backend: ## Start backend only
	cd backend && . venv/bin/activate && uvicorn app.main:app --reload --port 8080 --reload-exclude 'venv/*'

dev-frontend: ## Start frontend only
	cd frontend && npm run dev

docker-up: ## Start everything in Docker
	docker compose up --build

docker-down: ## Stop Docker containers
	docker compose down

test-health: ## Check backend health
	curl -s http://localhost:8080/api/health | python3 -m json.tool

test-agents: ## List available agents
	curl -s http://localhost:8080/api/agents | python3 -m json.tool

test-sessions: ## Check active sessions
	curl -s http://localhost:8080/api/sessions | python3 -m json.tool

clean: ## Remove build artifacts
	rm -rf backend/venv backend/__pycache__ backend/app/__pycache__
	rm -rf frontend/node_modules frontend/.next

deploy: ## Deploy backend to Cloud Run
	cd backend && bash deploy.sh

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help