.PHONY: up down build seed logs

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

seed:
	docker compose -f docker-compose.yml -f docker-compose.seed.yml run --rm seed

logs:
	docker compose logs -f

restart:
	docker compose restart
