killport:
	kill -9 $$(lsof -ti :4849) && kill -9 $$(lsof -ti :3001)
