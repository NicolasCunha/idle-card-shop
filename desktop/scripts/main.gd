extends Control
## Root of the desktop game. S2: an empty 240x160 screen.
## Later stages add the loading screen, the shop floor and the tab panels here.

const BASE_SIZE := Vector2i(240, 160)


func _ready() -> void:
	print("IdleCardShop %s ready at %dx%d" % [
		ProjectSettings.get_setting("application/config/version"), BASE_SIZE.x, BASE_SIZE.y])
