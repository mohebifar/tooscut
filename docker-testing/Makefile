SHELL := /bin/bash

COMPOSE := docker compose -f compose.yaml
MEDIA_VIDEO := media/sample-video.mp4
MEDIA_AUDIO := media/sample-audio.wav

.PHONY: setup serve destroy

setup:
	chmod +x media/generate.sh
	./media/generate.sh
	$(COMPOSE) pull
	$(COMPOSE) build

serve:
	$(COMPOSE) up -d --build

destroy:
	$(COMPOSE) down --volumes --remove-orphans --rmi local
	rm -f $(MEDIA_VIDEO) $(MEDIA_AUDIO)
