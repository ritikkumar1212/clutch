"""Anonymous handle generation — never derived from real identity."""
from __future__ import annotations

import secrets

ADJECTIVES = [
    "swift", "calm", "bright", "brave", "quiet", "lucky", "clever", "noble",
    "cosmic", "sunny", "misty", "rapid", "golden", "silent", "wild", "kind",
]
ANIMALS = [
    "panda", "falcon", "otter", "tiger", "koala", "heron", "lynx", "badger",
    "dolphin", "comet", "maple", "raven", "fox", "wolf", "sparrow", "nebula",
]


def generate_handle(taken: set[str]) -> str:
    """Return a unique `adjective_animal` handle (adds a numeric suffix on collision)."""
    for _ in range(50):
        handle = f"{secrets.choice(ADJECTIVES)}_{secrets.choice(ANIMALS)}"
        if handle not in taken:
            return handle
    return f"{secrets.choice(ADJECTIVES)}_{secrets.choice(ANIMALS)}_{secrets.randbelow(10_000):04d}"
