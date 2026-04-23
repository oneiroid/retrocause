"""Semi-automatic visual DAG builder.

Package layout:
  state.py   -- hashable domain states
  lex.py     -- action schemas and bound actions
  dag.py     -- DAG container with state dedup
  expand.py  -- frontier expansion using domain rules
  detect.py  -- convergence + template detectors (stub until step 8)
  export.py  -- DAG -> JSON for the viewer
"""
