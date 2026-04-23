"""Plain-stdlib test runner.

Discovers functions named test_* in every tests/test_*.py and runs them.
Prints PASS / FAIL per test, exits non-zero on any failure. No external
dependency on pytest (avoids install step in the Windows env).
"""
from __future__ import annotations

import importlib
import pkgutil
import sys
import traceback
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))


def collect_tests() -> list[tuple[str, object]]:
    tests_pkg = importlib.import_module("tests")
    found: list[tuple[str, object]] = []
    for info in pkgutil.iter_modules(tests_pkg.__path__):
        if not info.name.startswith("test_"):
            continue
        mod = importlib.import_module(f"tests.{info.name}")
        for attr in dir(mod):
            if attr.startswith("test_"):
                fn = getattr(mod, attr)
                if callable(fn):
                    found.append((f"{info.name}.{attr}", fn))
    return found


def main() -> int:
    tests = collect_tests()
    if not tests:
        print("no tests found")
        return 1

    passed = 0
    failed: list[tuple[str, str]] = []
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
            passed += 1
        except Exception:
            print(f"FAIL  {name}")
            failed.append((name, traceback.format_exc()))

    print(f"\n{passed}/{len(tests)} passed")
    if failed:
        print("\n--- failures ---")
        for name, tb in failed:
            print(f"\n{name}\n{tb}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
