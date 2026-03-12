# SPDX-License-Identifier: GPL-3.0-or-later
"""
SSL certificate management service — CA generation, server cert signing, upload parsing.
"""
import ipaddress
import logging
import os
import shutil
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

logger = logging.getLogger(__name__)

SSL_STORE_DIR = "/app/ssl_store"
NGINX_SSL_DIR = "/etc/nginx/ssl"


def _ensure_dirs():
    os.makedirs(SSL_STORE_DIR, exist_ok=True)
    os.makedirs(NGINX_SSL_DIR, exist_ok=True)


# ---------------------------------------------------------------------------
# Certificate generation
# ---------------------------------------------------------------------------

def generate_ca(
    common_name: str,
    organization: str = "NetMon",
    validity_days: int = 3650,
    key_size: int = 4096,
    prefix: str = "ca",
) -> tuple[str, str]:
    """Generate a self-signed CA certificate. Returns (cert_path, key_path)."""
    _ensure_dirs()

    key = rsa.generate_private_key(public_exponent=65537, key_size=key_size)

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
    ])

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=validity_days))
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_cert_sign=True,
                crl_sign=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.SubjectKeyIdentifier.from_public_key(key.public_key()),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    cert_path = os.path.join(SSL_STORE_DIR, f"{prefix}_cert.pem")
    key_path = os.path.join(SSL_STORE_DIR, f"{prefix}_key.pem")

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
    os.chmod(key_path, 0o600)

    return cert_path, key_path


def generate_csr(
    common_name: str,
    organization: str = "NetMon",
    san_dns_names: list[str] | None = None,
    san_ip_addresses: list[str] | None = None,
    key_size: int = 2048,
    prefix: str = "csr",
) -> tuple[str, str]:
    """Generate a CSR and private key. Returns (csr_path, key_path)."""
    _ensure_dirs()

    key = rsa.generate_private_key(public_exponent=65537, key_size=key_size)

    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
    ])

    builder = x509.CertificateSigningRequestBuilder().subject_name(subject)

    # Subject Alternative Names
    san_entries: list[x509.GeneralName] = []
    san_entries.append(x509.DNSName(common_name))
    for dns in (san_dns_names or []):
        dns = dns.strip()
        if dns and dns != common_name:
            san_entries.append(x509.DNSName(dns))
    for ip_str in (san_ip_addresses or []):
        ip_str = ip_str.strip()
        if ip_str:
            san_entries.append(x509.IPAddress(ipaddress.ip_address(ip_str)))

    if san_entries:
        builder = builder.add_extension(
            x509.SubjectAlternativeName(san_entries),
            critical=False,
        )

    csr = builder.sign(key, hashes.SHA256())

    csr_path = os.path.join(SSL_STORE_DIR, f"{prefix}_csr.pem")
    key_path = os.path.join(SSL_STORE_DIR, f"{prefix}_key.pem")

    with open(csr_path, "wb") as f:
        f.write(csr.public_bytes(serialization.Encoding.PEM))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
    os.chmod(key_path, 0o600)

    return csr_path, key_path


def extract_csr_metadata(csr_path: str) -> dict:
    """Extract metadata from a CSR file."""
    with open(csr_path, "rb") as f:
        csr = x509.load_pem_x509_csr(f.read())

    cn = ""
    try:
        cn = csr.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except (IndexError, ValueError):
        pass

    sans = []
    try:
        san_ext = csr.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        for name in san_ext.value.get_values_for_type(x509.DNSName):
            sans.append(name)
        for ip in san_ext.value.get_values_for_type(x509.IPAddress):
            sans.append(str(ip))
    except x509.ExtensionNotFound:
        pass

    return {
        "common_name": cn,
        "subject_alt_names": sans or None,
    }


def generate_server_cert(
    ca_cert_path: str,
    ca_key_path: str,
    common_name: str,
    san_dns_names: list[str] | None = None,
    san_ip_addresses: list[str] | None = None,
    validity_days: int = 365,
    key_size: int = 2048,
    prefix: str = "server",
) -> tuple[str, str]:
    """Generate a server certificate signed by the given CA. Returns (cert_path, key_path)."""
    _ensure_dirs()

    # Load CA
    with open(ca_cert_path, "rb") as f:
        ca_cert = x509.load_pem_x509_certificate(f.read())
    with open(ca_key_path, "rb") as f:
        ca_key = serialization.load_pem_private_key(f.read(), password=None)

    # Generate server key
    key = rsa.generate_private_key(public_exponent=65537, key_size=key_size)

    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    now = datetime.now(timezone.utc)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=validity_days))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                content_commitment=False,
                key_cert_sign=False,
                crl_sign=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
    )

    # Subject Alternative Names
    san_entries: list[x509.GeneralName] = []
    # Always include CN as a DNS SAN
    san_entries.append(x509.DNSName(common_name))
    for dns in (san_dns_names or []):
        dns = dns.strip()
        if dns and dns != common_name:
            san_entries.append(x509.DNSName(dns))
    for ip_str in (san_ip_addresses or []):
        ip_str = ip_str.strip()
        if ip_str:
            san_entries.append(x509.IPAddress(ipaddress.ip_address(ip_str)))

    if san_entries:
        builder = builder.add_extension(
            x509.SubjectAlternativeName(san_entries),
            critical=False,
        )

    cert = builder.sign(ca_key, hashes.SHA256())

    cert_path = os.path.join(SSL_STORE_DIR, f"{prefix}_cert.pem")
    key_path = os.path.join(SSL_STORE_DIR, f"{prefix}_key.pem")

    with open(cert_path, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    with open(key_path, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
    os.chmod(key_path, 0o600)

    return cert_path, key_path


# ---------------------------------------------------------------------------
# Upload parsing / validation
# ---------------------------------------------------------------------------

def parse_uploaded_cert(cert_data: bytes) -> x509.Certificate:
    """Parse and validate a PEM-encoded certificate."""
    return x509.load_pem_x509_certificate(cert_data)


def parse_uploaded_key(key_data: bytes) -> rsa.RSAPrivateKey:
    """Parse and validate a PEM-encoded private key."""
    return serialization.load_pem_private_key(key_data, password=None)


def save_uploaded_files(cert_data: bytes, key_data: bytes, prefix: str) -> tuple[str, str]:
    """Save uploaded cert+key PEM files. Returns (cert_path, key_path)."""
    _ensure_dirs()
    cert_path = os.path.join(SSL_STORE_DIR, f"{prefix}_cert.pem")
    key_path = os.path.join(SSL_STORE_DIR, f"{prefix}_key.pem")

    with open(cert_path, "wb") as f:
        f.write(cert_data)
    with open(key_path, "wb") as f:
        f.write(key_data)
    os.chmod(key_path, 0o600)

    return cert_path, key_path


# ---------------------------------------------------------------------------
# Certificate metadata extraction
# ---------------------------------------------------------------------------

def extract_cert_metadata(cert: x509.Certificate) -> dict:
    """Extract metadata from an x509 certificate object."""
    cn = ""
    try:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except (IndexError, ValueError):
        pass

    issuer_cn = ""
    try:
        issuer_cn = cert.issuer.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
    except (IndexError, ValueError):
        pass

    sans = []
    try:
        san_ext = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
        for name in san_ext.value.get_values_for_type(x509.DNSName):
            sans.append(name)
        for ip in san_ext.value.get_values_for_type(x509.IPAddress):
            sans.append(str(ip))
    except x509.ExtensionNotFound:
        pass

    is_ca = False
    try:
        bc = cert.extensions.get_extension_for_class(x509.BasicConstraints)
        is_ca = bc.value.ca
    except x509.ExtensionNotFound:
        pass

    fingerprint = cert.fingerprint(hashes.SHA256()).hex(":")

    return {
        "common_name": cn,
        "issuer": issuer_cn,
        "subject_alt_names": sans or None,
        "serial_number": format(cert.serial_number, "x"),
        "not_before": (cert.not_valid_before_utc if hasattr(cert, "not_valid_before_utc") else cert.not_valid_before).replace(tzinfo=None),
        "not_after": (cert.not_valid_after_utc if hasattr(cert, "not_valid_after_utc") else cert.not_valid_after).replace(tzinfo=None),
        "fingerprint_sha256": fingerprint,
        "is_ca": is_ca,
    }


# ---------------------------------------------------------------------------
# Activation — deploy cert to nginx SSL dir
# ---------------------------------------------------------------------------

def activate_cert(cert_path: str, key_path: str, ca_cert_path: str | None = None):
    """Copy cert+key to the nginx SSL directory for serving."""
    _ensure_dirs()
    shutil.copy2(cert_path, os.path.join(NGINX_SSL_DIR, "cert.pem"))
    shutil.copy2(key_path, os.path.join(NGINX_SSL_DIR, "key.pem"))
    os.chmod(os.path.join(NGINX_SSL_DIR, "key.pem"), 0o600)
    if ca_cert_path and os.path.exists(ca_cert_path):
        shutil.copy2(ca_cert_path, os.path.join(NGINX_SSL_DIR, "ca.pem"))
    logger.info("Activated SSL cert: %s", cert_path)


def delete_cert_files(cert_path: str, key_path: str, ca_cert_path: str | None = None):
    """Remove cert+key files from storage."""
    for path in [cert_path, key_path, ca_cert_path]:
        if path and os.path.exists(path):
            os.remove(path)


# ---------------------------------------------------------------------------
# Nginx reload via Docker API
# ---------------------------------------------------------------------------

def check_nginx_reload_available() -> bool:
    """Check if we can reload nginx via Docker socket."""
    try:
        import docker
        client = docker.from_env()
        client.ping()
        return True
    except Exception:
        return False


def reload_nginx() -> bool:
    """Send SIGHUP to the nginx container via Docker socket proxy. Returns success."""
    try:
        import httpx
        proxy_url = os.environ.get("DOCKER_PROXY_URL", "http://docker-proxy:2375")
        # List containers matching nginx name
        resp = httpx.get(
            f"{proxy_url}/containers/json",
            params={"filters": '{"name":["netmon-nginx"]}'},
            timeout=10,
        )
        containers = resp.json()
        if not containers:
            logger.warning("Nginx container not found")
            return False
        container_id = containers[0]["Id"]
        # Send SIGHUP
        kill_resp = httpx.post(
            f"{proxy_url}/containers/{container_id}/kill",
            params={"signal": "SIGHUP"},
            timeout=10,
        )
        if kill_resp.status_code == 204:
            logger.info("Sent SIGHUP to nginx container")
            return True
        logger.warning("Nginx kill returned %d", kill_resp.status_code)
        return False
    except Exception as e:
        logger.error("Failed to reload nginx: %s", e)
        return False
