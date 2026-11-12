"""Generate a VAPID keypair for Web Push and print ready-to-paste .env lines.

Run:  python -m app.scripts.gen_vapid
"""
from __future__ import annotations

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())

    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    # applicationServerKey = raw uncompressed EC point (0x04 || X || Y), base64url
    pub_raw = key.public_key().public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    pub_b64 = base64.urlsafe_b64encode(pub_raw).rstrip(b"=").decode()

    priv_env = priv_pem.replace("\n", "\\n")   # newline-safe for .env single line

    print("# ---- add to backend/.env ----")
    print(f"VAPID_PUBLIC_KEY={pub_b64}")
    print(f"VAPID_PRIVATE_KEY={priv_env}")
    print("VAPID_SUBJECT=mailto:you@uiet.ac.in")


if __name__ == "__main__":
    main()
