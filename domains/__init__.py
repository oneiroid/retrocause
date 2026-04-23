"""Domain rule modules. Each domain provides a Rules object with:
  seed()              -> initial state
  valid_actions(s)    -> list[Action]
  step(s, a)          -> State
  expr(s)             -> str (human-readable semantic expression)
  is_terminal(s)      -> bool
"""
